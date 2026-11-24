// MINES-21 Pass 2 — the false-alarm rate of its rule on honest data, DECLARED here and re-checkable with `npm run false-alarm:pass2`.
// The SCORED rule rejects when the per-slot STANDARDISED early-window return of every played slot of every revealed seed
// (src/simulate.ts playedSlots over src/loader.ts ALL_DATASETS) — each slot's return minus its exact mean, ÷ its exact sd,
// summed and ÷ √slots; that term is (win − p)/√(p(1 − p)), p = C(N − m, K)/C(N, K) — has a one-sided normal lower-tail p
// below 0.01. The pooled rule scored until 14 Oct 2026 on the Phase A slots (the aggregate return standardized by its exact
// mean and variance) is declared too, so its printed figure stays checkable. Both sums are skewed (a slot can win with
// chance below 1/40,000), so the true lower tail at the normal 1 % point can differ from 1 %. No closed form; this is a
// plain Monte Carlo over the played slots (fixed seed, xoshiro128**), the rate the share of replicates the rule rejects.
import { load, PRIMARY_FILE, ALL_DATASETS } from './loader.ts';
import { normalLowerTailP } from './stats.ts';
import { SIM_PASS2_ALPHA, SIM_PASS2_STATISTIC } from './sim-config.ts';
import { playedSlots } from './simulate.ts';
import { survivalComb, fracToDouble } from './rules.ts';

export const PASS2_FALSE_ALARM = Object.freeze({
  rate: 0.00989,
  standardError: 0.000221,
  replicates: 200_000,
  seed: 20261013,
  slots: 9682,
  method: 'plain Monte Carlo over the played slots of every revealed seed (win ~ Bernoulli(C(N − m, K)/C(N, K))), the per-slot standardised rule applied to each replicate',
  statistic: SIM_PASS2_STATISTIC,
});
/** The pooled rule scored until 14 Oct 2026 on the 8,500 Phase A slots (declared 13 Oct; same replicates and seed). */
export const PASS2_FALSE_ALARM_POOLED = Object.freeze({
  rate: 0.00789,
  standardError: 0.000198,
  replicates: 200_000,
  seed: 20261013,
  method: 'plain Monte Carlo over the 8,500 played Phase A slots (win ~ Bernoulli((N − m)/N), return = 99·N/(100·(N − m)) on a win), the pooled rule applied to each replicate',
});

function xoshiro(seed: number) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  return (): number => {
    const r = (Math.imul(Math.imul(b, 5) << 7 | Math.imul(b, 5) >>> 25, 9)) >>> 0;
    const t = b << 9; c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
    return r / 4294967296;
  };
}

/** The win chance of every played slot of every revealed seed, in dataset and nonce order. */
export const slotChances = (): number[] => ALL_DATASETS.flatMap(([, f]) => [...playedSlots(load(f)).values()].flat().map((s) => { const [c, d] = survivalComb(s.N, s.m, s.K); return fracToDouble(c, d); }));
const phaseASlots = () => load(PRIMARY_FILE).rounds.map((r) => { const q = r.requests.find((x) => x.path === '/mines2/bet')!; return { N: Number(q.body.grid), m: Number(q.body.mines) }; });

/** The scored (per-slot standardised) rule. */
export function simulatePass2FalseAlarm(replicates: number, seed: number) {
  const p = Float64Array.from(slotChances());
  const up = Float64Array.from(p, (q) => (1 - q) / Math.sqrt(q * (1 - q))), down = Float64Array.from(p, (q) => -q / Math.sqrt(q * (1 - q)));
  const root = Math.sqrt(p.length), rnd = xoshiro(seed);
  let rej = 0;
  for (let r = 0; r < replicates; r++) {
    let s = 0; for (let i = 0; i < p.length; i++) s += rnd() < p[i] ? up[i] : down[i];
    if (normalLowerTailP(s / root) < SIM_PASS2_ALPHA) rej++;
  }
  const rate = rej / replicates;
  return { rate: Number(rate.toFixed(5)), standardError: Number(Math.sqrt(rate * (1 - rate) / replicates).toPrecision(3)), replicates, seed, slots: p.length };
}

/** The pooled rule scored until 14 Oct 2026 on the Phase A slots (unchanged from its 13 Oct declaration). */
export function simulatePass2FalseAlarmPooled(replicates: number, seed: number) {
  const slots = phaseASlots();
  const p = Float64Array.from(slots, (s) => (s.N - s.m) / s.N);
  const m = Float64Array.from(slots, (s) => (99 * s.N) / (100 * (s.N - s.m)));
  let mean = 0, v = 0; for (let i = 0; i < p.length; i++) { mean += m[i] * p[i]; v += m[i] * m[i] * p[i] * (1 - p[i]); }
  const sd = Math.sqrt(v), rnd = xoshiro(seed);
  let rej = 0;
  for (let r = 0; r < replicates; r++) {
    let s = 0; for (let i = 0; i < p.length; i++) if (rnd() < p[i]) s += m[i];
    if (normalLowerTailP((s - mean) / sd) < SIM_PASS2_ALPHA) rej++;
  }
  const rate = rej / replicates;
  return { rate: Number(rate.toFixed(5)), standardError: Number(Math.sqrt(rate * (1 - rate) / replicates).toPrecision(3)), replicates, seed, slots: p.length };
}

if (process.argv[1] && /false-alarm-pass2\.ts$/.test(process.argv[1])) {
  const r = simulatePass2FalseAlarm(PASS2_FALSE_ALARM.replicates, PASS2_FALSE_ALARM.seed);
  const same = r.rate === PASS2_FALSE_ALARM.rate && r.standardError === PASS2_FALSE_ALARM.standardError && r.slots === PASS2_FALSE_ALARM.slots;
  console.log('scored (per-slot standardised):', JSON.stringify(r), same ? '== the declaration' : '!= the declaration: update PASS2_FALSE_ALARM');
  const q = simulatePass2FalseAlarmPooled(PASS2_FALSE_ALARM_POOLED.replicates, PASS2_FALSE_ALARM_POOLED.seed);
  const sameQ = q.rate === PASS2_FALSE_ALARM_POOLED.rate && q.standardError === PASS2_FALSE_ALARM_POOLED.standardError;
  console.log('pooled (Phase A, scored until 14 Oct):', JSON.stringify(q), sameQ ? '== the declaration' : '!= the declaration: update PASS2_FALSE_ALARM_POOLED');
  process.exitCode = same && sameQ ? 0 : 1;
}
