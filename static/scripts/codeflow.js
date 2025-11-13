// static/scripts/codeflow.js
// GAIA.CodeFlow — TL;DR pipeline (spec → code).
// Additive & safe. Only runs when you call shouldPipeline() and run().

// --- CodeFlow master toggle ----------------------------------------------
window.GAIA = window.GAIA || {};
window.GAIA.CodeFlow = window.GAIA.CodeFlow || {};
// Set to false to bypass CodeFlow completely (normal flow will be used)
if (typeof window.GAIA.CodeFlow.ENABLED === "undefined") {
  const saved = localStorage.getItem("gaia.codeflow.enabled");
  window.GAIA.CodeFlow.ENABLED = saved ? saved === "true" : false; // default: ON
}
window.GAIA.CodeFlow.setEnabled = (on) => {
  window.GAIA.CodeFlow.ENABLED = !!on;
  localStorage.setItem("gaia.codeflow.enabled", on ? "true" : "false");
};
// -------------------------------------------------------------------------

(() => {
  // Map an expensive choice to a cheaper code model you already support server-side.
  const CHEAP_BY_FAMILY = {
    "gemini-2.5-pro": "gemini-2.5-flash",
    "llama-3.3-70b-versatile": "llama-3.1-8b-instant",
    "grok": "llama-3.1-8b-instant",
    "gpt-5": "gpt-5-mini",
  };

  function looksLikeCodeIntent(text) {
    const t = String(text || "").toLowerCase();
    return (
      /(^|\s)(code|write|implement|build|script|api|sdk|function|class|regex|sql|query|snippet)(\s|$)/.test(t) ||
      t.includes("```") ||
      /\b(node|python|javascript|java|c#|c\+\+|go|rust|php|sql|bash|powershell|react|flask|express|fastapi)\b/.test(t)
    );
  }

  function cheapFor(model) {
    const m = String(model || "").toLowerCase();
    return CHEAP_BY_FAMILY[m] || m; // fallback to same if unknown
  }

  function buildSpecPrompt(userText) {
    return (
`You will NOT write code. Produce a compact build specification for the request below:

- language + runtime version
- key libraries/dependencies (with reasons)
- file plan (filenames)
- function/class signatures with inputs/outputs
- constraints/edge cases
- brief acceptance checks

Request:
${userText}`
    );
  }

  function buildCodePrompt(specText) {
    return (
`Generate the implementation strictly from this build spec. Output fenced code blocks with a language tag. Minimize comments.

After the code, add a short "Function summaries" section with 1–2 bullets per function.

Build spec:
${specText}`
    );
  }

  async function callAskJSON({ model, message, history }) {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, message, history: history || [] })
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return { ok: false, error: await res.text() };
    }
    const data = await res.json();
    return { ok: !!data?.ok, reply: data?.reply || "", model: data?.model || model, raw: data };
  }

  async function runPipeline({ model, question, history }) {
    // 1) SPEC (expensive or selected model)
    const spec = await callAskJSON({
      model,
      message: buildSpecPrompt(question),
      history
    });
    if (!spec.ok || !spec.reply.trim()) return spec;

    // 2) CODE (cheap)
    const cheapModel = cheapFor(model);
    const code = await callAskJSON({
      model: cheapModel,
      message: buildCodePrompt(spec.reply.trim()),
      history: [] // keep it lean — spec already encodes decisions
    });

    if (!code.ok || !code.reply.trim()) return code;

    // Compose final reply: spec (tiny) + code + summaries (already included)
    const finalReply =
`**Build spec (concise):**
${spec.reply.trim()}

${code.reply.trim()}`;
    return { ok: true, reply: finalReply, model: code.model };
  }

  // Public API
  function shouldPipeline(question, model, filesPresent) {
    if (!window.GAIA?.CodeFlow?.ENABLED) return false;
    if (filesPresent) return false; // keep file-tooling path unchanged
    // Only when the ask is codey AND the chosen model is likely expensive
    const q = looksLikeCodeIntent(question);
    const maybeExpensive = !/mini|flash|8b|haiku|command-r/i.test(model || "");
    return q && maybeExpensive;
  }

  // Minimal host glue (optional). If you don’t wire this, you can still call run()
  // and render the final reply yourself.
  async function runAndRender({ question, model, history, hooks = {} }) {
    const {
      before,              // () => void
      after,               // () => void
      renderAssistant,     // (text) => void  (used for final reply)
      renderError          // (text) => void
    } = hooks || {};

    try {
      before && before();
      const out = await runPipeline({ model, question, history });
      if (!out.ok) {
        // fall back to a normal single-call ask to avoid breaking UX
        const fb = await callAskJSON({ model, message: question, history });
        if (fb.ok) renderAssistant && renderAssistant(fb.reply);
        else renderError && renderError("Error: " + (out.error || fb.error || "pipeline failed"));
        return;
      }
      renderAssistant && renderAssistant(out.reply);
    } catch (e) {
      renderError && renderError("Error: " + (e?.message || String(e)));
    } finally {
      after && after();
    }
  }

  window.GAIA = window.GAIA || {};
  GAIA.CodeFlow = { shouldPipeline, run: runPipeline, runAndRender };
})();
