// Dip-bounce bot for make.fun "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261113-2314). Long only, $1,000 paper, cbBTC 1-minute bars.
//
// Idea: the dev window (2026-11-12 23:15 UTC -> 2026-11-13 23:14 UTC, BTC
// $71,409 -> $67,901, -4.91%) is a slow grind down with one sharp waterfall
// (~-2.4% in an hour around 03:00 UTC) and one real bounce off the low
// (~+1.8% over the next hour from 06:01 UTC). Generic trend / momentum /
// mean-reversion bots all lose on this window (verified: EMA, momentum,
// z-score and buy-and-hold all finish -$25..-$53). The only trade that pays
// is buying the bounce AFTER a deep drop has stopped falling, not the drop
// itself: entries fired mid-waterfall all stop out (~-$15..-$19 each).
//
// Entry (all conditions, on a bar's close; fills at the next bar's open):
//   - price is >= 1.5% below its close 240 minutes ago (a real drop, not noise)
//   - price has bounced >= 0.7% off its lowest close of the last 60 minutes
//     (the fall has actually turned; a 0.2-0.5% bounce fires mid-waterfall
//     and loses, a 0.7% bounce only fired once on the dev window: 06:20 UTC)
//   - no position held, fewer than 5 round trips used, >= 30 bars since the
//     last exit (no immediate re-entry churn)
// Exit (whole position, 100% of cash per trade):
//   - take profit +1.5% vs cost, stop loss -1.5% vs cost, or 360 bars max hold
//   - max_slippage_bps 100 on every order (1% past the deciding close)
// Mostly in cash otherwise. Parameters are few and sit on a plateau, not a
// knife-edge: on the dev window R 0.7-0.8%, TP 1.2-1.5%, SL 1.2-2.0%,
// W 240-300, D 1.2-2.0% all give +$9.80..+$11.16 with the same single trade.
//
// Deterministic: pure function of the closes seen so far; no clock, no
// randomness, no network, no files. Stdlib + vendored SDK only.

import { runBars, type BarsState, type Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const DROP_WINDOW = 240; // minutes of history the drop is measured over
const DROP_PCT = 0.015; // entry needs a >= 1.5% drop over DROP_WINDOW
const CONFIRM_WINDOW = 60; // minutes of history the bounce low is measured over
const CONFIRM_PCT = 0.007; // entry needs a >= 0.7% bounce off that low
const TAKE_PROFIT = 0.015;
const STOP_LOSS = 0.015;
const MAX_HOLD_BARS = 360;
const MAX_TRADES = 5;
const COOLDOWN_BARS = 30;
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
let entrySeq = -1;
let buys = 0;
let lastExitSeq = -1_000_000;
let prevHeld = false;

function rollingLow(n: number): number {
  let lo = Infinity;
  for (let i = Math.max(0, closes.length - n); i < closes.length; i++) {
    if (closes[i] < lo) lo = closes[i];
  }
  return lo;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    if (state.warmingUp) return [];
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(Number(bar.c) / 1e5);
    }
    if (!batch.bars.some((b) => b.symbol === SYMBOL)) return [];

    // Observe fills decided on the previous bar.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL) continue;
      if (fill.side === 'buy' && fill.status === 'filled') buys++;
      if (fill.side === 'sell' && fill.status === 'filled') lastExitSeq = state.seq;
    }

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && !prevHeld) entrySeq = state.seq;
    prevHeld = held !== undefined;
    if (held === undefined) {
      // Entry: deep drop + confirmed bounce, with trade budget and cooldown.
      if (buys >= MAX_TRADES) return [];
      if (state.seq - lastExitSeq < COOLDOWN_BARS) return [];
      if (closes.length <= DROP_WINDOW) return [];
      const now = closes[closes.length - 1];
      if (now / closes[closes.length - 1 - DROP_WINDOW] - 1 > -DROP_PCT) return [];
      if (now / rollingLow(CONFIRM_WINDOW) - 1 < CONFIRM_PCT) return [];
      if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    // Exit: take profit, stop loss, or max hold, on value vs cost.
    const value = state.value(SYMBOL, held.qty);
    const ret = Number(value) / Number(held.cost) - 1;
    if (ret >= TAKE_PROFIT || ret <= -STOP_LOSS || state.seq - entrySeq >= MAX_HOLD_BARS) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
