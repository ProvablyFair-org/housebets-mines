// HouseBets mines — FROZEN SIMULATION DESIGN, single-sourced so the producer (src/simulate.ts) and the verifier
// (tests/verify.ts, MINES-20 / MINES-21) cannot pin different experiments. Every seed of the experiment is a fixed string,
// so the census is a deterministic function of this file and the datasets: a re-run reproduces it byte for byte,
// and the verifier re-runs it in full rather than trusting a statistic the artifact reports about itself.

// ── The MINES profile's floors (games/mines/profile.json, MINES-20 / MINES-21), held apart from the design so a cheaper
// design cannot lower them: the verifier compares the census against THESE.
export const FLOOR_ROUNDS_PER_BOARD = 1_000_000;
export const FLOOR_PASS2_NONCES = 10_000;

// ── Significance, family-wise: Pass 1 runs four screens (position uniformity, lag-1, runs, RTP cells), each held to α/4,
// so MINES-20 as a whole fires on a fair game at most α = 1 % (union bound). Inside a screen every test is
// Bonferroni-corrected by the number of tests in it; the RTP-cell screen's rate is the exact binomial sum below.
export const ALPHA = 0.01;
export const ALPHA_SCREENS = 4;
export const ALPHA_SCREEN = ALPHA / ALPHA_SCREENS;

// ── Pass 1: every board (grid N, mine count m; 170 boards) has its own 100 fresh seeds × nonces 1..10,000 = 1,000,000
// rounds: 170,000,000 rounds, no round shared between two boards. A round of a board with m mines is drawn to its m picks,
// the board the published derivation gives it. The stopping depths of one board are settled on that board's rounds. The
// position-uniformity counts of step i of a grid pool the rounds of every board of that grid that draws a step i (m > i);
// the serial screens of a grid run on pick 0 of all its boards' rounds, in census order (m = 1 … N − 1).
export const PASS1_SEEDS = 100;
export const PASS1_NONCES = 10_000;
export const SIM_ROUNDS_PER_BOARD = PASS1_SEEDS * PASS1_NONCES;
export const pass1Seed = (N: number, m: number, i: number): { server: string; client: string } =>
  ({ server: `housebets-mines-audit/sim/pass1/grid-${N}/mines-${m}/server/${i}`, client: `housebets-mines-audit/sim/pass1/grid-${N}/mines-${m}/client/${i}` });
/** RTP convergence: the tiles opened in a simulated round are 0, 1, 2, … in that order (any fixed choice is equivalent on a
 *  uniform board); a round survives k tiles iff its smallest mine tile is ≥ k. Every (grid, mines, k) cell is tested. */
export const RTP_TILE_ORDER = 'tiles 0, 1, 2, … in order';
/** Edge tolerance per cell: |RTP_sim − RTP_exact| ≤ 5·SE + 1e-4, SE = σ/√n (src/false-alarm.ts edgeBandFalseAlarm). */
export const EDGE_SIGMAS = 5;
export const EDGE_BUFFER = 1e-4;
/** A cell is SCORED when its expected surviving rounds n·P(k safe) are at least this many. Below it the band holds almost
 *  every count (or none) and the cell carries no evidence, while its exact false-alarm rate climbs: summed over all 4,122
 *  cells it is 2.94, over the cells at ≥ 30 it is 1.77 × 10^-3 ≤ α/4 (src/false-alarm.ts edgeBandFalseAlarm, recomputed by
 *  MINES-20). Fixed from that false-alarm computation alone, before any cell statistic of the census was computed; the
 *  cells below it are printed, not scored. */
export const EDGE_MIN_EXPECTED = 30;

// ── Pass 2, cherry-pick: every revealed seed of every dataset (src/loader.ts ALL_DATASETS: Phase A, C, C $10, D, E and the
// 12 Oct file) × nonces 1..10,000, as the MINES profile's -21 rule asks (MANIFEST DL-6). Early window = the nonces the capture played on the
// seed (1..50 on a 13 Oct pair, 1..10 or fewer on a 12 Oct pair); reference window = the rest of 1..10,000. Each nonce plays
// the slot the capture played on the seed, cycled: the same board, the same tiles in the same order, to the same depth.
// The statistic is the per-slot standardised return: each slot's return minus its exact mean, ÷ its exact sd, summed and
// ÷ √slots. The multiplier cancels, so each term is (win − p)/√(p(1 − p)), p = C(N − m, K)/C(N, K). Pre-registered
// one-sided lower tail at ALPHA. The pooled return of the Phase A epochs (the statistic scored until 14 Oct 2026, on Phase A
// only) is still computed and printed; the switch to the standardised form was made after the pooled result was known
// (MANIFEST DL-6).
export const SIM_PASS2_STATISTIC = 'per-slot standardised return';
export const SIM_PASS2_NONCES = 10_000;
export const SIM_PASS2_EARLY_WINDOW_RULE = 'nonces 1 … n, n = the rounds the capture played on the seed';
export const PASS2_SLOT_RULE = 'nonce i plays the (i − 1) mod n-th captured round of the seed in nonce order: its board (N, m), the tiles it opened (the settled answer\'s opened tiles, then the mine it hit, then the rest of its planned order) up to its planned depth K; win iff none of those K tiles is a mine';
export const SIM_PASS2_ALPHA = ALPHA;
/** Returns are carried in 1e-12 units (the exact multiplier floored at 1e-12); means and variances as exact integers over
 *  D = lcm(25, 36, 49, 64) = 705,600 and D². */
export const PASS2_UNIT = 1_000_000_000_000n;
export const PASS2_D = 705_600n;

/** The fresh-seed server seeds are the sha256 hex of these strings (64 hex chars, the platform's seed shape). */
export const FRESH_SEED_RULE = 'serverSeed = sha256(label) as lowercase hex; clientSeed = label';
