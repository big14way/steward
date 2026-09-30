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
            client, model = anthropic.Anthropic(), os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
            # A one-paragraph reason needs no thinking budget. Most models take {"type": "disabled"}; newer ones ask for
            # {"type": "between_tools"} instead, so retry with that when the API says so.
            try:
                r = client.messages.create(model=model, max_tokens=400, thinking={"type": "disabled"},
                                           messages=[{"role": "user", "content": prompt}])
            except anthropic.BadRequestError as e:
                if "between_tools" not in str(e):
                    raise
                r = client.messages.create(model=model, max_tokens=400, thinking={"type": "between_tools"},
                                           messages=[{"role": "user", "content": prompt}])
            txt = next(b.text for b in r.content if getattr(b, "type", "") == "text")   # skip thinking blocks
            return json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
    except Exception:
        return None
    return None
