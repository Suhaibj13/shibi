import os
from typing import List, Dict

def _to_anthropic_messages(history: List[Dict], prompt: str):
    msgs=[]
    for m in history or []:
        role = "user" if m.get("role") == "user" else "assistant"
        text = (m.get("content") or "").strip()
        if text: msgs.append({"role": role, "content": [{"type":"text","text": text}]})
    if prompt:
        msgs.append({"role":"user", "content":[{"type":"text","text": prompt}]})
    return msgs

def generate(model_name: str, prompt: str, history=None):
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise RuntimeError("CLAUDE_API_KEY not set.")
    try:
        import anthropic
    except Exception:
        raise RuntimeError("anthropic package not installed.")
    client = anthropic.Anthropic(api_key=api_key)
    messages = _to_anthropic_messages(history, prompt)
    resp = client.messages.create(model=model_name, max_tokens=1024, temperature=0.7, messages=messages)
    parts=[]
    for b in resp.content or []:
        t = getattr(b, "text", None) or (b.get("text") if isinstance(b, dict) else None)
        if t: parts.append(t)
    return {"reply": "\n".join(parts).strip(), "model": model_name}
