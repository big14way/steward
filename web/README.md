# STEWARD web

Next.js (App Router) owner + contractor UI for STEWARD. Reads the FastAPI service in `../api`.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API, NEXT_PUBLIC_ALLOWANCE_MANAGER, NEXT_PUBLIC_EXPLORER, NEXT_PUBLIC_JUDGE_MODE
npm install
npm run dev                  # http://localhost:3000
```

Pages: `/` stats + latest decisions · `/allowances` create / fund / revoke (owner secret) · `/decisions` log with hash, rule, reason, replay ·
`/escalations` one-tap approve / reject · `/contractor` EIP-712 milestone submission with an injected wallet on Arc Testnet · `/sdk`.
