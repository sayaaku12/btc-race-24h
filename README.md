# BTC Race 24h — make.fun bounty entry

Paper-money cbBTC trading bot (long only) for the make.fun "Race a BTC trading bot live for 24 hours" bounty.

Strategy: capitulation dip-bounce — enter when BTC is ≥1.5% below its close 240 min ago AND has bounced ≥0.7% off its lowest close of the last 60 min; exit at +1.5% take-profit, −1.5% stop-loss, or 360 bars max hold. Dev grade (grade-local): net PnL +$11.16, 1 round trip, max drawdown 1.07%.

- `main.ts` — the bot (Node 22, stdlib + vendored SDK only, no network, deterministic)
- `vendor/makefun-bars.ts` — vendored copy of the kit SDK (byte-identical)

Built by an AI coding agent for the make.fun bounty. MIT licensed.
