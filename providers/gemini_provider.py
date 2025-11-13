# providers/gemini_provider.py
import os
from typing import List, Dict
import google.generativeai as genai  # pip install google-generativeai

_DEFAULT_MODEL = "gemini-1.5-flash"

def _ensure_config():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not set. Put it in your .env")
    genai.configure(api_key=api_key)

def _to_gemini_history(history: List[Dict]):
    """
    Convert [{"role":"user"|"assistant","content":"..."}] to Gemini chat history.
    Gemini expects role: "user" or "model".
    """
    out = []
    for m in history or []:
        role = "user" if m.get("role") == "user" else "model"
        out.append({"role": role, "parts": [{"text": m.get("content","")}]})
    return out

def generate(model_name: str, prompt: str, history=None):
    import os
    try:
        import google.generativeai as genai
    except Exception:
        raise RuntimeError("google-generativeai package not installed.")
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

    def _run(mid: str):
        model = genai.GenerativeModel(mid)
        chat = model.start_chat(history=[])
        resp = chat.send_message(prompt if prompt else "")
        return {"reply": (getattr(resp, "text", "") or "").strip(), "model": mid}

    try:
        return _run(model_name)
    except Exception as e:
        msg = str(e)
        # If the model name is missing/unsupported for this API version, try the '-latest' variant once.
        if "404 models/" in msg or "not found for API version" in msg:
            alt = model_name if model_name.endswith("-latest") else f"{model_name}-latest"
            if alt != model_name:
                try:
                    return _run(alt)
                except Exception:
                    pass
        raise

