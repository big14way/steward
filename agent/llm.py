"""LLM adapter. Returns a parsed JSON object or None; never raises into the decision loop."""
import json
import os

from config import LLM


def complete_json(prompt: str) -> dict | None:
    try:
        if LLM == "groq":
            from groq import Groq
            r = Groq(api_key=os.environ["GROQ_API_KEY"]).chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}, temperature=0.2, max_tokens=300)
            return json.loads(r.choices[0].message.content)
        if LLM == "anthropic":
            import anthropic
            r = anthropic.Anthropic().messages.create(
                model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"), max_tokens=300,
                messages=[{"role": "user", "content": prompt}])
            txt = r.content[0].text
            return json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
    except Exception:
        return None
    return None
