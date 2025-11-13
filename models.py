# GAIA V5 – Logical model resolver (backend)
from dataclasses import dataclass
import os

@dataclass(frozen=True)
class ResolvedModel:
    provider: str
    model_id: str
    logical: str
    light: bool = False

OPENAI_EXPENSIVE_MODEL = os.getenv("OPENAI_EXPENSIVE_MODEL", "gpt-5-2025-08-06"),
# One logical key per vendor for the picker; legacy keys kept for BC.
# _REGISTRY = {
#     # Groq (default best)
#     "grok":             ResolvedModel("groq",     "llama-3.3-70b-versatile",  "grok"),

#     # OpenAI (best-cheap)
#     "gpt-mini":         ResolvedModel("openai",   "gpt-4o-mini",              "gpt-mini",       light=True),

#     # Anthropic (best-cheap)
#     "claude-haiku":     ResolvedModel("anthropic","claude-3-haiku-20240307",  "claude-haiku",   light=True),

#     # Google Gemini (best-cheap)
#     "gemini-flash":     ResolvedModel("gemini",   "gemini-1.5-flash",         "gemini-flash",   light=True),

#     # Cohere (best-cheap)
#     "cohere-mini":      ResolvedModel("cohere",   "command-r",                "cohere-mini",    light=True),

#     # ---- Legacy aliases (kept so old chats don’t break) ----
#     "grok-light":       ResolvedModel("groq",     "llama-3.3-70b-versatile",  "grok-light",     light=True),
#     "gemini-pro":       ResolvedModel("gemini",   "gemini-1.5-pro",           "gemini-pro"),
#     "gemini":           ResolvedModel("gemini",   "gemini-1.5-flash",         "gemini",         light=True),
#     "chatgpt":          ResolvedModel("openai",   "gpt-4o-mini",              "chatgpt"),
#     "chatgpt-light":    ResolvedModel("openai",   "gpt-4o-mini",              "chatgpt-light",  light=True),
# }
# Best models for normal chat
_REGISTRY = {
    "grok":            ResolvedModel("groq",      "llama-3.3-70b-versatile",   "grok"),

    "gpt-5":          ResolvedModel("openai",       "gpt-5",          "GPT-5"),
    "claude-sonnet":   ResolvedModel("anthropic", "claude-3-5-sonnet-20240620", "claude-sonnet"),
    "gemini-pro":      ResolvedModel("gemini",    "gemini-2.5-pro",      "gemini-pro"),
    "cohere-plus":     ResolvedModel("cohere",    "command-r-plus",             "cohere-plus"),

    # --- Legacy / cheap aliases so old chats still work ---
    "gpt-4o":        ResolvedModel("openai",    "gpt-4o",                "gpt-4o",      light=True),
    "claude-haiku":    ResolvedModel("anthropic", "claude-3-haiku-20240307",    "claude-haiku",  light=True),
    "gemini-flash":    ResolvedModel("gemini",    "gemini-2.5-flash",    "gemini-flash",  light=True),
    "cohere-mini":     ResolvedModel("cohere",    "command-r",                  "cohere-mini",   light=True),
    #"gemini-pro":      ResolvedModel("gemini",    "gemini-1.5-pro-latest",       "gemini-pro"),   # also best
    "grok-light":      ResolvedModel("groq",      "llama-3.3-70b-versatile",    "grok-light",    light=True),
    # "gemini":          ResolvedModel("gemini",    "gemini-1.5-flash",           "gemini",        light=True),
    # "chatgpt":         ResolvedModel("openai",    "gpt-4o-mini",                "chatgpt"       light=True),
    # "chatgpt-light":   ResolvedModel("openai",    "gpt-4o-mini",                "chatgpt-light", light=True),
}
_DEFAULT = _REGISTRY["grok"]

def resolve(logical_key: str) -> ResolvedModel:
    key = (logical_key or "").strip().lower()
    return _REGISTRY.get(key, _DEFAULT)
