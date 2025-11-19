# config.py
import os

def env_any(*names, default=None, required=False):
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    if required and default is None:
        raise RuntimeError(f"Missing required env: one of {names}")
    return default

# Canonical keys (accept common variants)
OPENAI_API_KEY = env_any("OPENAI_API_KEY", "OPENAI_KEY")
GROQ_API_KEY   = env_any("GROQ_API_KEY", "GROQAPIKEY", "GROQ_APIKEY", "GROQ_KEY", "GSK_KEY")
GOOGLE_API_KEY = env_any("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY")

# Flask secret for sessions
SECRET_KEY     = env_any("SECRET_KEY", required=True)
