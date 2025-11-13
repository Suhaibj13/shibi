// static/scripts/memory.js
;(() => {
  const NS = "GAIA_MEM_V1";

  const loadDB = () => {
    try { return JSON.parse(localStorage.getItem(NS) || "{}"); }
    catch { return {}; }
  };
  const saveDB = (db) => {
    try { localStorage.setItem(NS, JSON.stringify(db)); } catch {}
  };

  // Public API
  const Memory = {
    init() {
      // no-op for now; hook for migrations
      const db = loadDB(); saveDB(db);
    },

    // Store a single message in memory (per chat)
    record(chatId, role, content, meta = {}) {
      if (!chatId || !role) return;
      const db = loadDB();
      db[chatId] = db[chatId] || { messages: [], last10AI: [] };

      // push into messages
      db[chatId].messages.push({
        role, content: String(content || ""), meta: meta || {}, t: Date.now()
      });

      // prune to a sane size (200 is plenty)
      if (db[chatId].messages.length > 200) {
        db[chatId].messages = db[chatId].messages.slice(-200);
      }

      // quick ring buffer for last 10 AI answers
      if (role === "assistant") {
        const buf = db[chatId].last10AI;
        buf.push({ content: content || "", t: Date.now() });
        if (buf.length > 10) buf.splice(0, buf.length - 10);
      }

      saveDB(db);
    },

    // Return recent messages for UI (not compacted)
    recent(chatId, limit = 25) {
      const db = loadDB(); const m = (db[chatId]?.messages || []);
      return m.slice(Math.max(0, m.length - limit));
    },

    // Build compact context for API (latest K turns, trimmed by chars)
    contextForChat(chatId, turns = 8, maxChars = 4000) {
      const db = loadDB(); const all = (db[chatId]?.messages || []);
      let ctx = all.slice(-Math.max(2, turns * 2)); // user+assistant pairs

      // simple char-based trimming from oldest if too large
      const len = (arr) => arr.reduce((s, m) => s + (m.content?.length || 0), 0);
      while (len(ctx) > maxChars && ctx.length > 2) ctx.shift();

      // For the API we only send role/content to keep payload small
      const forApi = ctx.map(({ role, content }) => ({ role, content }));
      return { ctx, forApi, compact: forApi };
    },
    // expose on GAIA namespace so app.js can call it
    // Get last 1 AI answer quickly
    lastAI(chatId) {
      const db = loadDB(); const buf = db[chatId]?.last10AI || [];
      return buf[buf.length - 1]?.content || "";
    },
  };

  window.GAIA = window.GAIA || {};
  window.GAIA.Memory = Memory;

})();
