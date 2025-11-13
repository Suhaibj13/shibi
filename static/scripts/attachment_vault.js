/*! GAIA V6 — Attachments Vault (right panel, per-chat persistent files)
 *  - Stores non-image files per chat in IndexedDB (blobs), with a small index in localStorage
 *  - Renders a slim right panel inside .chat-column
 *  - Width = 25% of left navigation (auto-measured on resize)
 *  - API:
 *      AttachVault.recordAndRender(chatId, FileList|Array<File>)
 *      AttachVault.renderForChat(chatId)
 */

(function (window, document) {
  const DB_NAME = "gaia_vault_v1";
  const STORE = "files";
  const LS_IDX = "gaia_vault_index_v1"; // { chatId: [sha, sha, ...] }

  // --- Utils ---
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s = "") => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isImageFile = (f) =>
    /^image\//i.test(f.type || "") || /\.(png|jpe?g|gif|bmp|svg|webp)$/i.test(f.name || "");
  const fmtKB = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n)) + " KB");

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "sha" });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  // put near the top with other utils
    function iconForFile(name = "", type = "") {
    const n = (name || "").toLowerCase();
    if ((type||"").startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(n)) return "🖼️";
    if (/\.pdf$/.test(n)) return "📄";
    if (/\.(xls|xlsx|csv|tsv|ods)$/.test(n)) return "📈";
    if (/\.(doc|docx)$/.test(n)) return "📝";
    if (/\.(ppt|pptx)$/.test(n)) return "📊";
    if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return "🗜️";
    if (/\.(txt|md|log|json|yaml|yml|xml)$/.test(n) || (type||"").startsWith("text/")) return "📜";
    return "📎";
    }

  async function sha256File(file) {
    const buf = await file.arrayBuffer();
    try {
        if (crypto?.subtle?.digest) {
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
        return { sha: hex, buf };
        }
    } catch (_) { /* fall through */ }
    // Fallback: stable-ish id per file, no cryptography required
    const base = [file.name, file.type, file.size, file.lastModified].join("|");
    const salt = Math.random().toString(36).slice(2);
    return { sha: base + "|" + salt, buf };
  }


  const loadIndex = () => { try { return JSON.parse(localStorage.getItem(LS_IDX)) || {}; } catch { return {}; } };
  const saveIndex = (m) => localStorage.setItem(LS_IDX, JSON.stringify(m || {}));

  // --- Panel DOM ---
  function ensurePanel() {
    const col = $(".chat-column");
    if (!col) return null;
    let panel = $("#vault-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "vault-panel";
      panel.className = "vault-panel";
      panel.innerHTML = `
        <div class="vault-head">
          <span class="vault-title">Files</span>
          <span class="vault-count" id="vault-count">0</span>
        </div>
        <div class="vault-list" id="vault-list"></div>
      `;
      col.appendChild(panel);
      measureAndSetWidth(); // initial width
      window.addEventListener("resize", measureAndSetWidth);
    }
    return panel;
  }

  function measureAndSetWidth() {
    const side = $(".sidebar");
    const panel = $("#vault-panel");
    if (!side || !panel) return;
    const w = side.offsetWidth ? Math.max(56, Math.round(side.offsetWidth * 0.25)) : 60;
    panel.style.setProperty("--vault-w", w + "px");
    // Also expose to :root so layout rules (chat padding) can read the same value
    document.documentElement.style.setProperty("--vault-w", w + "px");
  }

  function itemRow(rec) {
    const nm = esc(rec.name || "file");
    const sizeKB = fmtKB(Math.round((rec.size || 0) / 1024));
    const url = URL.createObjectURL(rec.data);
    return `
      <div class="v-item" data-sha="${rec.sha}" title="${nm}">
        <a class="v-name" href="${url}" download="${nm}">${nm}</a>
        <span class="v-size">${sizeKB}</span>
        <button class="v-x" aria-label="Remove" title="Remove">✕</button>
      </div>
    `;
  }

  // --- Store operations ---
    // Accepts Array<File> | FileList | [{file: File}, …]
    async function addFiles(chatId, files) {
    const list = Array.from(files || [])
        .map(x => (x instanceof File ? x : (x && x.file) ? x.file : null))
        .filter(Boolean);

    // 1) Prepare records (read/sha OUTSIDE any transaction)
    const prepared = [];
    for (const f of list) {
        // your existing sha256File(File) is fine; keep using it if present:
        const { sha, buf } = await sha256File(f);
        prepared.push({
        sha,
        chatId: String(chatId),
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size || 0,
        data: new Blob([buf], { type: f.type || "application/octet-stream" }),
        savedAt: Date.now()
        });
    }

    // 2) Single atomic commit
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const rec of prepared) store.put(rec);
    await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("tx aborted"));
    });
    db.close();

    // 3) Keep your in-LS index in sync (if you still use it)
    const idx = loadIndex();
    idx[chatId] = Array.from(new Set([...(idx[chatId] || []), ...prepared.map(r => r.sha)]));
    saveIndex(idx);
    }




  async function listForChat(chatId) {
    const idx = loadIndex();
    const shas = idx[chatId] || [];
    if (!shas.length) return [];
    const db = await openDB();
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const out = [];
    for (const sha of shas) {
      // eslint-disable-next-line no-await-in-loop
      const rec = await new Promise((res, rej) => {
        const r = store.get(sha);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      });
      if (rec) out.push(rec);
    }
    db.close();
    return out;
  }

  async function remove(chatId, sha) {
    const db = await openDB();
    await new Promise((res, rej) => {
      const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(sha);
      r.onsuccess = res;
      r.onerror = () => rej(r.error);
    });
    db.close();

    const idx = loadIndex();
    if (idx[chatId]) idx[chatId] = idx[chatId].filter(s => s !== sha);
    saveIndex(idx);
  }

  // --- Render ---
  async function renderForChat(chatId) {
    ensurePanel(); // make sure the right-panel exists
    const panel = document.querySelector(".vault-panel");
    const countEl = panel?.querySelector(".vault-count");
    const listEl  = panel?.querySelector(".vault-list");
    if (!panel || !countEl || !listEl) return;

    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);

    // simple + robust: read all, then filter by chatId (avoids index mismatch)
    const all = await new Promise((res, rej) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror   = () => rej(req.error);
    });
    db.close();

    const rows = (all || []).filter(r => String(r.chatId) === String(chatId))
                            .sort((a,b) => b.savedAt - a.savedAt);

    countEl.textContent = String(rows.length);
    listEl.innerHTML = rows.map(r => `
    <div class="v-item" data-sha="${r.sha}" title="${esc(r.name)}">
        <span class="v-ico">${iconForFile(r.name, r.type)}</span>
        <a class="v-name" href="${URL.createObjectURL(r.data)}" download="${esc(r.name)}">${esc(r.name)}</a>
        <span class="v-size">${fmtKB(Math.round((r.size || 0)/1024))}</span>
        <button class="v-x" aria-label="Remove" title="Remove">✕</button>
    </div>
    `).join(rows.length ? "" : `<div class="vault-empty">No files</div>`);
    // delegate once
    if (!listEl._vaultBound) {
        listEl.addEventListener("click", async (e) => {
            const x = e.target.closest(".v-x");
            if (!x) return;
            const row = x.closest(".v-item");
            const sha = row?.dataset.sha;
            if (!sha) return;
            try {
            await remove(String(chatId), sha);
            row.remove();
            countEl.textContent = String(listEl.querySelectorAll(".v-item").length);
            } catch (err) {
            console.warn("Delete failed:", err);
            }
        });
        listEl._vaultBound = true;
        }

    }


  // Accept Array<File>, FileList, or [{file: File}, …]
    async function recordAndRender(chatId, files) {
    const list = Array.from(files || [])
        .map(x => (x instanceof File ? x : (x && x.file) ? x.file : null))
        .filter(Boolean);

    if (!list.length) {
        await renderForChat(chatId);
        return;
    }
    await addFiles(chatId, list);
    await renderForChat(chatId);
    
    }


  // expose
  window.AttachVault = { recordAndRender, renderForChat, addFiles, listForChat, deleteFile: remove };

  // boot: size sync if panel exists
  document.addEventListener("DOMContentLoaded", () => {
    ensurePanel();
    measureAndSetWidth();
  });
})(window, document);
