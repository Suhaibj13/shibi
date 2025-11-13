import os
from typing import List, Dict

def _flatten(history: List[Dict], prompt: str) -> str:
    lines=[]
    for m in history or []:
        lines.append(f"{m.get('role','user')}: {m.get('content','')}")
    if prompt:
        lines.append(f"user: {prompt}")
    return "\n".join(lines).strip()

def generate(model_name: str, prompt: str, history=None):
    api_key = os.getenv("COHERE_API_KEY")
    if not api_key:
        raise RuntimeError("COHERE_API_KEY not set.")
    try:
        # Newer SDK (v2)
        from cohere import ClientV2
        c2 = ClientV2(api_key=api_key)
        r = c2.responses.create(model=model_name, input=_flatten(history, prompt))
        out = getattr(r, "output_text", None) or getattr(r, "text", None)
        if not out and hasattr(r, "response"):
            out = getattr(r.response, "text", None)
        return {"reply": (out or "").strip(), "model": model_name}
    except Exception:
        # Older SDK (v1) fallback
        import cohere
        client = cohere.Client(api_key)
        r = client.chat(model=model_name, message=prompt or _flatten(history, ""))
        text = getattr(r, "text", None) or (getattr(r, "generation", None) or "")
        return {"reply": (text or "").strip(), "model": model_name}
