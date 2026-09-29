# STEWARD web

Next.js (App Router) owner + contractor UI for STEWARD. Reads the FastAPI service in `../api`.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API, NEXT_PUBLIC_ALLOWANCE_MANAGER, NEXT_PUBLIC_EXPLORER, NEXT_PUBLIC_JUDGE_MODE
npm install
npm run dev                  # http://localhost:3000
```

Pages: `/` overview · `/contractors` add contractor, copy their link, top up, end budget · `/approvals` one-tap approve / decline · `/activity` audit log with replay ·
`/treasury` reserve + vault · `/c/[token]` the contractor's private page (request payment, track status; no wallet needed) · `/contractor` own-wallet signing (advanced) · `/sdk`.
