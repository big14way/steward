"""Refresh the README live-stats row from the hosted API. Used by .github/workflows/stats.yml daily and by hand:
    python scripts/refresh_stats.py https://api-production-c6a14.up.railway.app
"""
import datetime
import json
import pathlib
import sys
import urllib.request

api = (sys.argv[1] if len(sys.argv) > 1 else "https://api-production-c6a14.up.railway.app").rstrip("/")
s = json.load(urllib.request.urlopen(f"{api}/stats", timeout=30))
b = s["by_action"]
pct = lambda v: "—" if v is None else f"{v:g}%"
row = (f"| {s['allowances']} | {s['payers']} | {s['contractors']} | {s['usdc_paid']:.2f} | {s['decisions']} | "
       f"{b.get('PAY', 0)}/{b.get('PARTIAL', 0)}/{b.get('HOLD', 0)}/{b.get('ESCALATE', 0)}/{b.get('SCREEN_FAIL', 0)} | "
       f"{pct(s['human_agreed_pct'])} | {pct(s['on_time_pct'])} | {s['usyc_swept']:.2f} | {s['integrators']} |")
p = pathlib.Path(__file__).resolve().parent.parent / "README.md"
lines = p.read_text().split("\n")
i = next(k for k, l in enumerate(lines) if l.startswith("| Allowances | Payers |"))
now = datetime.datetime.now(datetime.timezone.utc)
changed = lines[i + 2] != row
lines[i + 2] = row
lines = [(f"## 📊 Live stats — Arc Testnet (updated {now:%b %-d}, {now:%H:%M} UTC, from the hosted API)" if l.startswith("## 📊 Live stats") else l) for l in lines]
p.write_text("\n".join(lines))
print(row)
print("changed" if changed else "unchanged")
