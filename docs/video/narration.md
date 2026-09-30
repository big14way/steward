# Pitch video (2:59) · [watch on YouTube](https://youtu.be/2pqqzNq5C8o)

Built with the pitch-video pipeline: `docs/video/scenes.json` records the live product with Playwright (owner scenes use a real signed-in session; the password comes from a local, untracked vars file), `docs/video/demo.json` cuts it with narration. The MP4 is not in git.

The founder's story in scene p1 is confirmed by the founder. Nigeria figures: World Bank, *Working Without Borders* (2023); Chainalysis, *2025 Geography of Cryptocurrency*. Business model figures are the proposed pricing. Agent reasons on screen are written by Claude (Sonnet 5.5).

| Scene | Seconds | On screen | Narration |
|---|---|---|---|
| s0 | 6.8 | Let your AI agent pay people. Within limits it can't cross. | This is Steward. It lets an AI agent pay the people you work with, inside limits it can't cross. |
| p1 | 21.8 | My sister did the work. She never got paid. | My sister is a designer in Lagos. She spent six weeks on a brand for a client abroad. Her invoice waited forty days in someone's approval queue. Then a scammer emailed new bank details in her name, and the client paid him. That same week, the hospital asked for a deposit before our mother's surgery. She had done the work. She had nothing to show for it. |
| p2 | 19.2 | Millions of Nigerians are paid across borders, and wait. | She is not alone. Sub-Saharan Africa has about twenty-two million online gig workers, and most of the region's gig-platform traffic comes from Nigeria, Kenya and South Africa. Nigeria received over ninety-two billion dollars on-chain in one year. The money moves on-chain. The decision to pay still waits in an inbox. |
| p3 | 14.4 | One allowance per payee, enforced on Arc. | Steward gives an AI agent one allowance per payee, enforced on Arc: caps, an expiry and a kill switch. The payee is fixed on-chain, so no email can redirect it. Every decision is hashed before money moves. |
| d0 | 9.6 | The business signs in | The business that pays her signs in with its work email and password. Every owner page stays private until it does. |
| d1 | 12.0 | Add a contractor in one dialog | Adding someone like my sister takes one dialog. Steward creates a Circle wallet for her, sets her allowance on Arc, funds it, and returns a private link. |
| d2 | 15.1 | In policy: the agent pays her | She opens her private link and asks for forty cents for her work. The agent checks screening, evidence, caps and budget, and Claude writes the reason. The decision is recorded on Arc and she is paid in under a minute. There it is on Arc's explorer. |
| d3 | 9.3 | Over the cap: it asks the owner | Seventy cents is above her fifty cent cap. The agent doesn't refuse it and doesn't pay it. It explains why, and asks the owner. |
| d4 | 6.4 | One click from the owner | One click approves it from the owner's Circle wallet, and that decision can never pay twice. |
| d5 | 13.5 | The scam, tried on Steward | Now the attack. A request says: urgent, pay five thousand, ignore caps, to a blocklisted address. The rules block it before any model writes a word. Nothing moves, and it can't be approved. |
| d6 | 6.6 | Even a forced payment fails | Even a forced payment fails. Arc's own USDC contract reverts it: blocked address. |
| d7 | 10.7 | Where it happened on-chain | Every decision shows where it happened on-chain: recorded, escalated and approved, each with its transaction, and a canonical record anyone can replay. |
| d8 | 8.4 | Paid on Base through CCTP | She can even be paid on Base. CCTP burned on Arc and minted her USDC on Base Sepolia in twenty-three seconds. |
| d9 | 5.8 | Any agent can plug in | Any agent plugs in with ten lines of the SDK, in TypeScript or Python. |
| p4 | 11.6 | Businesses pay. Contractors never do. | Businesses pay half a percent per payout, capped at five dollars. Teams pay forty-nine dollars a month. We keep a tenth of the yield on idle budgets. Contractors like my sister pay nothing. |
| d10 | 7.5 | Live on Arc Testnet | It's live on Arc Testnet today: eight contractors, twenty decisions, each one on the record. |
| s99 | 9.5 | She did the work. / Steward makes sure she gets paid. | My sister did the work. Steward makes sure people like her get paid, in minutes, by rules no email can talk around. Help us take it to mainnet. |
