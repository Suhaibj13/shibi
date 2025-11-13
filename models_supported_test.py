import os
from dotenv import load_dotenv; load_dotenv()

def p(title, rows):
    print(f"\n=== {title} ===")
    for r in rows or []:
        print(" -", r)

# OpenAI (v1)
try:
    from openai import OpenAI
    oai = OpenAI(api_key=os.getenv("GPT_API_KEY"))
    p("OpenAI", [m.id for m in oai.models.list().data])
except Exception as e:
    p("OpenAI (error)", [str(e)])

# Groq
try:
    from groq import Groq
    gr = Groq(api_key=os.getenv("GROQ_API_KEY"))
    p("Groq", [m.id for m in gr.models.list().data])
except Exception as e:
    p("Groq (error)", [str(e)])

# Anthropic
try:
    from anthropic import Anthropic
    an = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    p("Anthropic", [m.id for m in an.models.list().data])
except Exception as e:
    p("Anthropic (error)", [str(e)])

# Gemini
try:
    import google.generativeai as genai
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    p("Gemini", [m.name for m in genai.list_models()])
except Exception as e:
    p("Gemini (error)", [str(e)])

# Cohere
try:
    import cohere
    co = cohere.Client(os.getenv("COHERE_API_KEY"))
    # some SDKs expose .models.list().models; handle both shapes
    models = getattr(co.models.list(), "models", None) or co.models.list()
    names = [getattr(m, "name", None) or getattr(m, "id", None) for m in models]
    p("Cohere", names)
except Exception as e:
    p("Cohere (error)", [str(e)])

# xAI (OpenAI-compatible)
try:
    from openai import OpenAI
    xai = OpenAI(api_key=os.getenv("XAI_API_KEY"), base_url="https://api.x.ai/v1")
    p("xAI (Grok)", [m.id for m in xai.models.list().data])
except Exception as e:
    p("xAI (error)", [str(e)])
