// GAIA V5 – Model selector (1 per vendor)
// Logical keys only; backend resolves concrete model + provider.

// export const MODEL_OPTIONS = [
//   { key: "gpt-mini",        label: "GPT (4o-mini)" },
//   { key: "claude-haiku",    label: "Claude (Haiku)" },
//   { key: "gemini-flash",    label: "Gemini (1.5 Flash)" },
//   { key: "cohere-mini",     label: "Cohere (Command-R Mini)" },
//   { key: "grok",            label: "Groq (Llama 3.3)" },           // default
// ];
// GAIA – Best models in UI. Backend resolves these logical keys.
export const MODEL_OPTIONS = [
  { key: "gpt-5",         label: "GPT-5" },
  { key: "claude-sonnet",  label: "Claude 3.5 Sonnet" },
  { key: "gemini-pro",     label: "Gemini 2.5 Pro" },
  { key: "cohere-plus",    label: "Cohere Command-R+" },
  { key: "grok",           label: "Groq (Llama 3.3 70B)" }, // default
];

export function hydrateModelSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value || "grok";
  selectEl.innerHTML = "";
  MODEL_OPTIONS.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.key;
    o.textContent = opt.label;
    selectEl.appendChild(o);
  });
  selectEl.value = MODEL_OPTIONS.find(o => o.key === current) ? current : "grok";
}
