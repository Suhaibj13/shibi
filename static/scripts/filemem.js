// GAIA File Memory (client-only, additive, safe)
// Stores text extracted from uploaded files per chat, plus a compact summary
// and small chunks for cheap retrieval later.
//
// Public API:
//   GAIA.FileMem.init()
//   GAIA.FileMem.indexFromUpload(chatId, {id,name,mime,size}, text)
//   GAIA.FileMem.selectForQuery(chatId, query, budgetTokens=1200) -> Array<message>
//   GAIA.FileMem.findByName(chatId, name) -> fileEntry | null
//
// Zero backend changes. If you never call these functions, this file does nothing.

(() => {
  const LS_KEY = "gaia_filemem_v1";
  const MAX_FILES_PER_CHAT = 12;
  const MAX_CHUNKS_PER_FILE = 8;
  const CHUNK_SIZE_CHARS = 1200;     // ~300 tokens per chunk
  const SUMMARY_TOK_BUDGET = 260;    // ≤ ~260 tokens
  const SELECT_BUDGET_DEFAULT = 1200; // ≤ ~1200 input tokens for snippets

  // ----------------- utils -----------------
  const tok = (s) => Math.ceil(String(s || "").length / 4);
  const norm = (s) => String(s || "").toLowerCase().trim();
  const now = () => Date.now();

  function splitSentences(t) {
    const s = String(t || "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    return s.split(/(?<=[\.!?])\s+/).map(x => x.trim()).filter(Boolean);
  }

  function extractBullets(t, max = 6) {
    return String(t || "")
      .split(/\n/)
      .map(l => (l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/) || [,""])[1].trim())
      .filter(Boolean)
      .slice(0, max);
  }

  function topSentences(t, maxTok = SUMMARY_TOK_BUDGET) {
    const sents = splitSentences(t);
    if (!sents.length) return "";
    const rank = sents.map(s => {
      const len = s.replace(/[`*_#>\-\(\)\[\]]/g, "").length;
      const caps = (s.match(/[A-Z][a-z]+/g) || []).length;
      return { s, score: len * 0.7 + caps * 2 };
    }).sort((a,b) => b.score - a.score);

    const out = [];
    let bud = maxTok;
    for (const { s } of rank) {
      const k = tok(s);
      if (out.length && bud - k < 0) break;
      out.push(s);
      bud -= k;
      if (bud <= 0 || out.length >= 5) break;
    }
    return out.join(" ");
  }

  function makeSummary(t, maxTok = SUMMARY_TOK_BUDGET) {
    const head = topSentences(t, Math.max(120, Math.min(maxTok, SUMMARY_TOK_BUDGET)));
    const bullets = extractBullets(t, 4);
    const bul = bullets.length ? ("\n- " + bullets.join("\n- ")) : "";
    let sum = (head + bul).trim();
    const over = tok(sum) - maxTok;
    if (over > 0) {
      const parts = sum.split(/\s+/);
      sum = parts.slice(0, Math.max(20, parts.length - over)).join(" ");
    }
    return sum;
  }

  function splitParas(t) {
    return String(t || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  function chunkText(t, targetChars = CHUNK_SIZE_CHARS) {
    const paras = splitParas(t);
    const chunks = [];
    let buf = "";
    for (const p of paras) {
      if ((buf + "\n\n" + p).length > targetChars && buf) {
        chunks.push(buf); buf = p;
      } else {
        buf = buf ? (buf + "\n\n" + p) : p;
      }
    }
    if (buf) chunks.push(buf);

    const out = [];
    for (const c of chunks) {
      if (c.length <= targetChars) { out.push(c); continue; }
      for (let i = 0; i < c.length; i += targetChars) out.push(c.slice(i, i + targetChars));
    }
    return out.slice(0, MAX_CHUNKS_PER_FILE);
  }

  function sanitizeName(n) {
    const base = String(n || "").replace(/\.[a-z0-9]+$/i, ""); // drop extension
    return base.replace(/[_\-\.]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function fuzzyScoreFileName(name, q) {
    const a = sanitizeName(name);
    const b = sanitizeName(q);
    if (!a || !b) return 0;
    if (a === b) return 3;
    if (b.includes(a)) return 2.5;
    if (a.includes(b)) return 2.2;
    // shared tokens
    const at = new Set(a.split(" "));
    const bt = new Set(b.split(" "));
    let inter = 0;
    for (const t of at) if (bt.has(t)) inter++;
    return inter ? 1 + inter / Math.max(at.size, bt.size) : 0;
  }

  // ----------------- storage -----------------
  const Store = { byChat: {} };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      Store.byChat = raw.byChat || {};
    } catch { Store.byChat = {}; }
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ byChat: Store.byChat }));
    } catch(_) {
      // storage might be full; best-effort prune: oldest files across all chats
      try {
        Object.keys(Store.byChat).forEach(cid => {
          const bag = Store.byChat[cid];
          if (bag?.files?.length > MAX_FILES_PER_CHAT) {
            bag.files = bag.files.slice(-MAX_FILES_PER_CHAT);
          }
        });
        localStorage.setItem(LS_KEY, JSON.stringify({ byChat: Store.byChat }));
      } catch {}
    }
  }

  function ensureChat(cid) {
    if (!Store.byChat[cid]) Store.byChat[cid] = { files: [] };
    if (!Array.isArray(Store.byChat[cid].files)) Store.byChat[cid].files = [];
    return Store.byChat[cid];
  }

  // ----------------- API -----------------
  function init() {
    load();
    // prune per-chat lists
    try {
      Object.keys(Store.byChat).forEach(cid => {
        const bag = Store.byChat[cid];
        if (!bag || !Array.isArray(bag.files)) return;
        // drop corrupt entries & cap list
        bag.files = bag.files.filter(f => f && f.id && f.name);
        if (bag.files.length > MAX_FILES_PER_CHAT) {
          bag.files = bag.files.slice(-MAX_FILES_PER_CHAT);
        }
      });
      save();
    } catch {}
  }

  // Record (or refresh) a file for a chat
  function indexFromUpload(chatId, meta, text) {
    try {
      if (!chatId || !meta || !meta.name) return;
      const bag = ensureChat(chatId);

      // Remove any previous entry with same id or same name (latest wins)
      bag.files = bag.files.filter(f => f.id !== meta.id && norm(f.name) !== norm(meta.name));

      const entry = {
        id: meta.id || ("f_" + Math.random().toString(36).slice(2)),
        name: meta.name,
        mime: meta.mime || "",
        size: meta.size || 0,
        ts: now(),
        hasText: !!text,
        summary: "",
        chunks: [],
        // kept for debugging / very small files; we may inline entire text if tiny
        tinyText: ""
      };

      if (text && text.trim()) {
        const t = String(text);
        // If extremely small, keep whole text (handy for tiny .txt)
        if (t.length <= 2000) entry.tinyText = t;
        entry.summary = makeSummary(t, SUMMARY_TOK_BUDGET);
        entry.chunks  = chunkText(t, CHUNK_SIZE_CHARS).map((c,i) => ({ i, t: c }));
      }

      bag.files.push(entry);
      // Cap to last N files
      if (bag.files.length > MAX_FILES_PER_CHAT) bag.files = bag.files.slice(-MAX_FILES_PER_CHAT);
      save();
    } catch {}
  }

  function findByName(chatId, name) {
    try {
      const bag = Store.byChat[chatId];
      if (!bag?.files?.length) return null;
      let best = null, bestScore = 0;
      for (const f of bag.files) {
        const s = fuzzyScoreFileName(f.name, name);
        if (s > bestScore) { bestScore = s; best = f; }
      }
      return best;
    } catch { return null; }
  }

  // Choose context messages for a query. Returns an array of {role, content}.
  function selectForQuery(chatId, query, budgetTokens = SELECT_BUDGET_DEFAULT) {
    try {
      const bag = Store.byChat[chatId];
      if (!bag?.files?.length) return [];

      const q = norm(query);
      // If the user explicitly mentions a filename token, prefer that file.
      // Else, if deictic references (“that file”, “the requirements file”), pick most recent match.
      let candidate = null, maxScore = 0;

      for (const f of bag.files) {
        const s1 = fuzzyScoreFileName(f.name, q);
        if (s1 > maxScore) { maxScore = s1; candidate = f; }
      }

      if (!candidate) {
        // Very light deictic heuristic
        if (/\b(that|this|the)\s+file\b/.test(q)) {
          candidate = bag.files[bag.files.length - 1]; // most recent
        }
      }

      if (!candidate) return [];

      // Build messages staying within budget
      const out = [];
      let used = 0;

      // If tiny text is available and fits: just send it as-is with a minimal header
      if (candidate.tinyText) {
        const msg = { role: "assistant", content: `${candidate.name}\n\n${candidate.tinyText}` };
        const k = tok(msg.content);
        if (k <= budgetTokens) return [msg];
      }

      // Otherwise: add a minimal filename header (small) to help grounding
      const header = { role: "assistant", content: `${candidate.name}` };
      used += tok(header.content);
      out.push(header);

      if (candidate.summary) {
        const sumMsg = { role: "assistant", content: candidate.summary };
        const k = tok(sumMsg.content);
        if (used + k <= budgetTokens) { out.push(sumMsg); used += k; }
      }

      if (candidate.chunks?.length) {
        // Simple relevance: prefer chunks with highest overlap with query words
        const terms = new Set(q.split(/\W+/).filter(Boolean).map(x => x.toLowerCase()));
        const scored = candidate.chunks.map(ch => {
          const words = new Set(String(ch.t || "").toLowerCase().split(/\W+/).filter(Boolean));
          let hit = 0; for (const w of terms) if (words.has(w)) hit++;
          return { ch, score: hit };
        }).sort((a,b) => b.score - a.score);

        for (const { ch } of scored) {
          const m = { role: "assistant", content: ch.t };
          const k = tok(m.content);
          if (used + k > budgetTokens) break;
          out.push(m); used += k;
          if (out.length >= 1 + 1 + 3) break; // header + summary + ≤3 chunks
        }
      }

      // If we somehow exceed, trim from end (keep header + summary)
      while (out.length && used > budgetTokens) {
        const rm = out.pop();
        used -= tok(rm.content);
      }
      return out;
    } catch { return []; }
  }

  // expose
  window.GAIA = window.GAIA || {};
  GAIA.FileMem = { init, indexFromUpload, selectForQuery, findByName };

  // auto-init defensively
  try { init(); } catch {}
})();
