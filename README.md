# LOPS

*Little operator, big follow-through.*

[![Live site](https://img.shields.io/badge/live-Lops.onl-orange)](https://Lops.onl)
![Chain](https://img.shields.io/badge/chain-Solana-black)

LOPS is a small blocky AI operator on Solana: two square eyes, one flat mouth, zero idle time.

**Contract address:** `CA pending` (shown in the site header once published)

## Overview

Lops.onl is a static site with a live market board. The board reads open feeds directly in the browser, so there is no server to run.

## Features

- Always-visible contract-address slot with click-to-copy (inert until the address is published)
- Live Solana market board: ten boosted tokens, price, 24h change, volume, liquidity
- Ticker built from the same live data, refreshed every 60 seconds and paused while the tab is hidden
- A pinned first row for the LOPS token that activates when its contract address is published
- Spring-physics reveals, hero parallax, spotlight hover, full reduced-motion fallback

## Links

- Site: https://Lops.onl
- X: pending
- GitHub: pending

## Develop

```bash
npm install
npm run build    # writes dist/
npm run verify   # builds both register branches and checks the gates
```

Every external fact lives in one record in `src/register.json` with a state of `stated`, `absent` or `unconfirmed`. Anything not `stated` renders inert.
