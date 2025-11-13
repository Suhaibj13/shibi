// static/scripts/elm.js
// GAIA.ELM — Expensive-look helper for cheap models in heavy-context flows.
// No globals modified. Call GAIA.ELM.maybeAugmentHistory(...) before a send.

(() => {
  const CHEAP_MODELS = new Set([
    "gemini-2.5-flash",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gpt-4o-mini",
    "command-r"
  ]);

  function roughTokens(s){ return Math.ceil(String(s||"").length / 4); }

  function isHeavyContext({ filesPresent, history }) {
    if (filesPresent) return true;
    // treat as "heavy" if last assistant turn or the history tail is long
    const tail = (history || []).slice(-6);
    const t = tail.reduce((sum, m) => sum + roughTokens(m?.content || ""), 0);
    return t > 1200; // ~4.8k chars
  }

  // Pick the variant based on the ask; keep very short, model-neutral.
  function buildELM(userText) {
    const t = String(userText || "").toLowerCase();
    if (/\b(code|function|class|api|script|regex|sql|query|snippets?)\b/.test(t)) {
      return (
`Write a natural, well-structured answer. Provide working code in fenced blocks with a language tag and minimal comments. Integrate concrete details from context without meta phrases like “based on the provided text”. Avoid inventing facts.`
      );
    }
    if (/\b(story|narrative|poem|character|dialogue)\b/.test(t)) {
      return (
`Write smooth, coherent paragraphs with natural transitions and concrete details. Vary sentence length. Avoid meta commentary.`
      );
    }
    return (
`Write a natural, well-structured answer in complete paragraphs. Integrate details from context without saying meta phrases like “based on the provided text”. Use bullets only when the user asks. Do not invent facts.`
    );
  }

  function maybeAugmentHistory(history, { model, userText, filesPresent } = {}) {
    try {
      const modelId = String(model || "").toLowerCase();
      const hist = Array.isArray(history) ? history.slice() : [];
      if (!CHEAP_MODELS.has(modelId)) return hist;         // only cheap models
      if (!isHeavyContext({ filesPresent, history: hist })) return hist;

      // If there is already a Space SOP at head (system), insert ELM right after it.
      const sysIdx = hist.findIndex(m => m?.role === "system");
      const instruction = { role: "system", content: buildELM(userText) };

      if (sysIdx === 0) return [hist[0], instruction, ...hist.slice(1)];
      if (sysIdx > 0)   return [instruction, ...hist];     // keep simple
      return [instruction, ...hist];
    } catch { return history; }
  }

  window.GAIA = window.GAIA || {};
  GAIA.ELM = { maybeAugmentHistory };
})();
