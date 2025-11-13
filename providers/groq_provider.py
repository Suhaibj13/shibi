# providers/groq_provider.py
import os
from typing import List, Dict

from groq import Groq  # pip install groq


# expects GROQ_API_KEY in env
_API_KEY = os.getenv("GROQ_API_KEY")
_client = Groq(api_key=_API_KEY) if _API_KEY else None

# sensible default; you can pass a specific one from your UI
_DEFAULT_MODEL = "llama-3.3-70b-versatile"

def _to_openai_messages(history: List[Dict]) -> List[Dict]:
    """
    Convert our history [{"role":"user"|"assistant","content": "..."}] to
    OpenAI-style messages for Groq.
    """
    msgs = []
    for m in history or []:
        role = "user" if m["role"] == "user" else "assistant"
        msgs.append({"role": role, "content": m["content"]})
    return msgs

def generate(model_name: str, prompt: str, history=None) -> str:
    """
    Call Groq chat completions and return a single reply string.
    """
    if _client is None:
        raise RuntimeError("GROQ_API_KEY not set. Put it in your .env")

    model = model_name or _DEFAULT_MODEL
    messages = _to_openai_messages(history) + [{"role": "user", "content": prompt}]

    resp = _client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
    )
    # Groq’s schema mirrors OpenAI’s: choices[0].message.content
    text = (resp.choices[0].message.content or "").strip()
    # Groq returns `resp.model`
    return {"reply": text, "model": resp.model}
