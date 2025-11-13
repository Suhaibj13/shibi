// GAIA Response Memory (client-only, lightweight, no provider calls)
// Stores compact summaries of assistant replies + small chunk index,
// and returns a budgeted context window for /ask and /ask/stream.
//
// Public API (used by app.js):
//   GAIA.Memory.init()
//   GAIA.Memory.record(chatId, role, text, { idx, stream })
//   GAIA.Memory.contextForChat(chatId, maxPairs = 8, budgetTokens = 4000)

(() => {
  const LS_CHAT_KEY = "gaia_chats_v2";     // same schema as app.js
  const LS_MEM_KEY  = "gaia_memory_v1";    // memory store

  function loadChats() { try { return JSON.parse(localStorage.getItem(LS_CHAT_KEY)) || []; } catch { return []; } }
  function getChat(chatId) { return (loadChats().find(c => c.id === chatId)) || null; }

  // Cheap token estimator (≈4 chars/token, good enough for budgeting)
  const tok = s => Math.ceil(String(s || "").length / 4);

  // ---- storage ----
  const Store = { byChat: {} };
  function loadStore() {
    try { const raw = JSON.parse(localStorage.getItem(LS_MEM_KEY)) || {}; Object.assign(Store, { byChat: raw.byChat || {} }); }
    catch { Store.byChat = {}; }
  }
  function saveStore() { localStorage.setItem(LS_MEM_KEY, JSON.stringify({ byChat: Store.byChat })); }
  function ensure(chatId) { if (!Store.byChat[chatId]) Store.byChat[chatId] = { entries: [] }; return Store.byChat[chatId]; }

  // ---- tiny NLP helpers (extractive & deterministic) ----
  function splitSentences(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    return t.split(/(?<=[\.!?])\s+/).map(s => s.trim()).filter(Boolean);
  }
  function splitParagraphs(text) {
    return String(text || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }
  function mostInformativeSentences(text, maxTokens = 220) {
    const sents = splitSentences(text);
    if (!sents.length) return "";
    // Simple informative ranking: prefer longer, non-boilerplate sentences
    const scored = sents.map(s => {
      const len = s.replace(/[`*_#>\-\(\)\[\]]/g, "").length;
      const caps = (s.match(/[A-Z][a-z]+/g) || []).length; // crude "entity" count
      return { s, score: len * 0.7 + caps * 2 };
    }).sort((a,b) => b.score - a.score);

    const out = [];
    let budget = maxTokens;
    for (const { s } of scored) {
      const t = tok(s);
      if (out.length && budget - t < 0) break;
      out.push(s);
      budget -= t;
      if (budget <= 0) break;
      if (out.length >= 5) break; // cap #sentences
    }
    return out.join(" ");
  }
  function extractListBullets(text, max = 6) {
    const lines = String(text || "").split(/\n/);
    const bullets = [];
    for (const ln of lines) {
      const m = ln.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (m && m[1]) bullets.push(m[1].trim());
      if (bullets.length >= max) break;
    }
    return bullets;
  }
  function makeSummary(text, maxTokens = 260) {
    if (!text) return "";
    const head = mostInformativeSentences(text, Math.max(120, Math.min(maxTokens, 260)));
    const bullets = extractListBullets(text, 4);
    const bul = bullets.length ? ("\n- " + bullets.join("\n- ")) : "";
    let sum = (head + bul).trim();
    // Trim to budget
    const over = tok(sum) - maxTokens;
    if (over > 0) sum = sum.split(" ").slice(0, Math.max(20, Math.floor(sum.split(" ").length - over))).join(" ");
    return sum;
  }
  function chunkText(text, targetChars = 1200) {
    const paras = splitParagraphs(text);
    const chunks = [];
    let buf = "";
    for (const p of paras) {
      if ((buf + "\n\n" + p).length > targetChars && buf) {
        chunks.push(buf);
        buf = p;
      } else {
        buf = buf ? (buf + "\n\n" + p) : p;
      }
    }
    if (buf) chunks.push(buf);
    // Split again if some paras were huge
    const out = [];
    for (const c of chunks) {
      if (c.length <= targetChars) { out.push(c); continue; }
      for (let i = 0; i < c.length; i += targetChars) out.push(c.slice(i, i + targetChars));
    }
    return out.slice(0, 8); // keep tiny index
  }

  // ---- public API ----
  function record(chatId, role, text, meta = {}) {
    if (!chatId || !role) return;
    loadStore(); // ensure latest in case multiple tabs
    const bag = ensure(chatId);

    // We only need to summarize/index ASSISTANT replies
    if (role !== "assistant" || !text || !text.trim()) {
      saveStore();
      return;
    }
    const entry = {
      idx: typeof meta.idx === "number" ? meta.idx : null,
      ts: Date.now(),
      size_toks: tok(text),
      summary: makeSummary(text, 260),
      chunks: chunkText(text, 1200).map((c, i) => ({ i, t: c }))
    };

    // Store only last 10 assistant memories to avoid growth
    bag.entries = (bag.entries || []).filter(e => e && typeof e === "object");
    bag.entries.push(entry);
    if (bag.entries.length > 10) bag.entries = bag.entries.slice(-10);

    saveStore();
  }

  // Return a compact context with a strict budget:
  // - last ~N exchanges (from chat history)
  // - plus the distilled summary of the last assistant reply (as an assistant note)
  // If budget is tight, we include only a tiny tail + the summary.
  function contextForChat(chatId, maxPairs = 8, budgetTokens = 4000) {
    const chat = getChat(chatId);
    const forApi = [];
    if (!chat || !Array.isArray(chat.history)) return { forApi };

    const hist = chat.history
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: String(m.content || "") }));

    // Start with the tail (≈ last N exchanges = 2N messages)
    const tail = hist.slice(-(maxPairs * 2));
    let used = tail.reduce((s, m) => s + tok(m.content), 0);

    // Always include the tail if it fits
    for (const m of tail) forApi.push(m);

    // Add a distilled summary of the last assistant answer (if any)
    loadStore();
    const bag = Store.byChat[chatId];
    const lastMem = bag && Array.isArray(bag.entries) && bag.entries.length ? bag.entries[bag.entries.length - 1] : null;
    if (lastMem && lastMem.summary) {
      const sumMsg = {
        role: "assistant",
        // Label as a note so the model understands why it’s short
        content: `Summary of previous assistant reply:\n${lastMem.summary}`
      };
      const cost = tok(sumMsg.content);
      if (used + cost <= budgetTokens) {
        forApi.push(sumMsg);
        used += cost;
      }
    }

    // If lots of room left AND the last reply was huge, add 1–2 chunks
    if (lastMem && lastMem.chunks && lastMem.chunks.length) {
      for (const ch of lastMem.chunks.slice(0, 2)) {
        const msg = { role: "assistant", content: `Relevant excerpt:\n${ch.t}` };
        const cost = tok(msg.content);
        if (used + cost > budgetTokens) break;
        forApi.push(msg);
        used += cost;
      }
    }

    // Final guard: if we somehow exceeded budget, trim from the start (oldest messages first)
    while (forApi.length && used > budgetTokens) {
      const gone = forApi.shift();
      used -= tok(gone.content);
    }
    return { forApi };
  }

  function init() {
    loadStore();
    // Soft prune very old entries across all chats (keep last 10 per chat)
    Object.keys(Store.byChat).forEach(cid => {
      const bag = Store.byChat[cid];
      if (!bag || !Array.isArray(bag.entries)) return;
      if (bag.entries.length > 10) bag.entries = bag.entries.slice(-10);
    });
    saveStore();
  }

  // Export
  window.GAIA = window.GAIA || {};
  GAIA.Memory = { init, record, contextForChat };
})();
