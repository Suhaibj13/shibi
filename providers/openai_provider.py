import os
from typing import List, Dict

def _to_openai_messages(history: List[Dict], prompt: str) -> List[Dict]:
    msgs=[]
    for m in history or []:
        role = "user" if (m.get("role") == "user") else "assistant"
        text = (m.get("content") or "").strip()
        if text: msgs.append({"role": role, "content": text})
    if prompt:
        msgs.append({"role":"user", "content": prompt})
    return msgs

def generate(model_name: str, prompt: str, history=None):
    api_key = os.getenv("GPT_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("GPT_API_KEY not set.")
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        msgs = _to_openai_messages(history, prompt)
        resp = client.chat.completions.create(model=model_name, messages=msgs, temperature=0.7)
        text = (resp.choices[0].message.content or "").strip()
        return {"reply": text, "model": resp.model}
    except Exception:
        # legacy fallback if newer SDK not present
        import openai as openai_legacy
        openai_legacy.api_key = api_key
        msgs = _to_openai_messages(history, prompt)
        r = openai_legacy.ChatCompletion.create(model=model_name, messages=msgs)
        text = (r["choices"][0]["message"]["content"] or "").strip()
        return {"reply": text, "model": model_name}
