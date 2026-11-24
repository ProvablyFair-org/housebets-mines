// HouseBets mines — the simulation CENSUS (MINES-20 Pass 1, MINES-21 Pass 2). A pure function of src/sim-config.ts and the
// package's datasets: counts and exact integer sums only, re-derived into statistics by the verifier, which re-runs this
// census in full. Pass 2 replays every revealed seed of every dataset (src/loader.ts ALL_DATASETS).
//   npm run simulate        rewrite outputs/simulation-results.json (the pinned artifact) and print its sha256
//   npm run simulate:run    write outputs/run/simulation-results.json (a regeneration, compared by scripts/fresh-copy-check.mjs)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { positionFromU, sha256Hex } from './rng.ts';
import { GRIDS } from './spec.ts';
import { ROOT, load, ALL_DATASETS } from './loader.ts';
import { PASS1_SEEDS, PASS1_NONCES, pass1Seed, SIM_PASS2_NONCES, SIM_PASS2_EARLY_WINDOW_RULE, PASS2_SLOT_RULE, PASS2_UNIT, PASS2_D, FRESH_SEED_RULE, RTP_TILE_ORDER } from './sim-config.ts';
import type { Dataset, Game, Round } from './types.ts';

/** byCell: per (grid/mines/depth) cell the window's [rounds, wins] — what the per-slot standardised return (MINES-21) is
 *  computed from. ret12, meanD and varD2 (the pooled return printed for Phase A) are carried on the Phase A epochs only. */
export interface Window { rounds: number; wins: number; byCell: Record<string, [number, number]>; ret12?: string; meanD?: string; varD2?: string }
export interface GridCensus {
  grid: number; rounds: number;   // rounds per board (every mine count of the grid on its own seeds)
  stepRounds: number[];       // [step i]: rounds of the grid that drew a step i (every board with more than i mines)
  stepIndex: number[][];      // [step i][position j among the N − i tiles left]
  tileAtStep: number[][];     // [tile t][step i]: rounds in which tile t was the i-th pick
  minMine: number[][];        // [m − 1][K]: rounds of the m-mine board in which its smallest mine tile is K (K = 0 … N − m)
  firstPick: { n: number; sumX: string; sumX2: string; sumXY: string; upper: number; runs: number };   // serial screens on pick 0 of every round of the grid
}
export interface Census {
  design: Record<string, unknown>;
  pass1: GridCensus[];
  pass2: { epochs: { set: string; epoch: number; seedHash: string; early: Window; ref: Window }[] };
}

const fresh = (label: string): string => sha256Hex(label);

/** One grid's Pass 1 census. */
function gridCensus(N: number): GridCensus {
  const S = N - 1;
  const stepIndex = Array.from({ length: S }, (_, i) => new Array(N - i).fill(0));
  const tileAtStep = Array.from({ length: N }, () => new Array(S).fill(0));
  const minMine = Array.from({ length: S }, (_, mi) => new Array(N - mi).fill(0));   // m = mi + 1: K in 0..N − m
  let sx = 0n, sx2 = 0n, sxy = 0n, prev = -1, n = 0, upper = 0, runs = 0; let lastUp: boolean | null = null;
  const stepRounds = new Array(S).fill(0);
  const left = new Array<number>(N);
  for (let m = 1; m <= S; m++) for (let s = 0; s < PASS1_SEEDS; s++) {   // board (N, m): its own seeds, drawn to its m picks
    const { server, client } = pass1Seed(N, m, s); const key = Buffer.from(fresh(server), 'utf8'); const mmRow = minMine[m - 1];
    for (let nonce = 1; nonce <= PASS1_NONCES; nonce++) {
      for (let i = 0; i < N; i++) left[i] = i;
      let blk = 0, buf: Buffer | null = null, off = 32, rem = N, mn = N;
      for (let i = 0; i < m; i++) {
        if (off === 32) { buf = createHmac('sha256', key).update(`${client}:${nonce}:${blk++}`).digest(); off = 0; }
        const j = positionFromU(buf!.readUInt32BE(off), rem); off += 4;
        const t = left[j]; left.splice(j, 1); rem--;
        stepIndex[i][j]++; tileAtStep[t][i]++; stepRounds[i]++;
        if (t < mn) mn = t; if (i === m - 1) mmRow[mn]++;
        if (i === 0) {
          const X = BigInt(t); sx += X; sx2 += X * X; if (prev >= 0) sxy += BigInt(prev) * X; prev = t; n++;
          const up = 2 * t >= N; if (up) upper++; if (up !== lastUp) { runs++; lastUp = up; }
        }
      }
    }
  }
  return { grid: N, rounds: PASS1_SEEDS * PASS1_NONCES, stepRounds, stepIndex, tileAtStep, minMine,
    firstPick: { n, sumX: String(sx), sumX2: String(sx2), sumXY: String(sxy), upper, runs } };
}

/** The single-tile return of board (N, m) in 1e-12 units: floor(99·N / (100·(N − m)) · 10^12). */
export const mult12 = (N: number, m: number): bigint => (99n * BigInt(N) * PASS2_UNIT) / (100n * BigInt(N - m));
/** Its exact mean × D and variance × D² for a fair board: P(win) = (N − m)/N. */
export const meanD = (N: number, m: number): bigint => mult12(N, m) * BigInt(N - m) * (PASS2_D / BigInt(N));
export const varD2 = (N: number, m: number): bigint => mult12(N, m) ** 2n * BigInt(N - m) * BigInt(m) * (PASS2_D / BigInt(N)) ** 2n;

/** One played slot: the board (N, m), the tiles the round opens in order and the depth K it plays to; `won` is the SERVED
 *  outcome (payout > 0), which the replay of the early window must reproduce. */
export interface Slot { N: number; m: number; K: number; tiles: number[]; nonce: number; won: boolean }

/** Does the slot's round win at this nonce: are its K tiles all outside the first m picks? (draws only as far as needed) */
export function slotWins(key: Buffer, client: string, nonce: number, s: { N: number; m: number; K: number; tiles: number[] }): boolean {
  const left = Array.from({ length: s.N }, (_, i) => i); const want = new Set(s.tiles.slice(0, s.K));
  let blk = 0, buf: Buffer | null = null, off = 32;
  for (let i = 0; i < s.m; i++) {
    if (off === 32) { buf = createHmac('sha256', key).update(`${client}:${nonce}:${blk++}`).digest(); off = 0; }
    const j = positionFromU(buf!.readUInt32BE(off), s.N - i); off += 4;
    if (want.has(left.splice(j, 1)[0])) return false;
  }
  return true;
}

const g200 = (q: any): Game | null => (q && q.status === 200 && q.response && typeof q.response === 'object' && q.response.game) ? q.response.game : null;
/** The server's settled answer of a record (the 24 h round: the server's own record of finishing it), or null. */
function settledOf(r: Round): Game | null {
  if (r.closedByServer && r.detail?.response?.game?.active === false) return r.detail.response.game;
  const q = [...r.requests].reverse().find((x) => g200(x)?.active === false); return q ? g200(q) : null;
}

/** Every epoch's played slots in nonce order (PASS2_SLOT_RULE). One slot per served round: the records of one round (the
 *  12 Oct round split over two records by a resumed finish) give one slot, from the record that holds the settled answer. */
export function playedSlots(ds: Dataset): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>(); const seen = new Set<string>();
  for (const r of ds.rounds) {
    const g = settledOf(r); if (!g || !g.fairness?.hashedServerSeed) continue;
    const id = String(g.roundId); if (seen.has(id)) throw new Error(`round ${id} settled on two records`); seen.add(id);
    const K = Number(r.spec.depth); const tiles: number[] = [];
    for (const t of [...(g.opened || []), ...(g.hit == null ? [] : [g.hit]), ...(r.spec.order || [])]) if (!tiles.includes(t) && tiles.length < K) tiles.push(t);
    const h = g.fairness.hashedServerSeed; const a = out.get(h) || []; out.set(h, a);
    a.push({ N: Number(g.grid), m: Number(g.mines), K, tiles, nonce: Number(g.fairness.nonce), won: Number(g.payout) > 0 });
  }
  for (const a of out.values()) a.sort((x, y) => x.nonce - y.nonce);
  return out;
}

export function census(sets: readonly (readonly [string, Dataset])[], onProgress?: (s: string) => void): Census {
  const pass1 = GRIDS.map((N) => { const c = gridCensus(N); onProgress?.(`pass 1 grid ${N}: ${N - 1} boards × ${c.rounds} rounds`); return c; });
  const epochs: Census['pass2']['epochs'] = [];
  for (const [set, ds] of sets) {
    const slots = playedSlots(ds); const pooled = set === 'A';
    for (const sd of ds.seeds) {
      const played = slots.get(sd.hashedServerSeed) || []; if (!played.length) continue;
      const key = Buffer.from(sd.revealedServerSeed, 'utf8');
      const early = played.length;   // the early window is the captured nonces 1 … n of the seed (SIM_PASS2_EARLY_WINDOW_RULE)
      const z = () => ({ rounds: 0, wins: 0, ret: 0n, mean: 0n, v: 0n, by: new Map<string, [number, number]>() });
      const acc = { early: z(), ref: z() };
      for (let nonce = 1; nonce <= SIM_PASS2_NONCES; nonce++) {
        const s = played[(nonce - 1) % played.length];
        const win = slotWins(key, sd.clientSeed, nonce, s);
        const a = nonce <= early ? acc.early : acc.ref;
        a.rounds++; if (win) a.wins++;
        if (pooled) { if (win) a.ret += mult12(s.N, s.m); a.mean += meanD(s.N, s.m); a.v += varD2(s.N, s.m); }
        const bk = `${s.N}/${s.m}/${s.K}`; const b = a.by.get(bk) || [0, 0]; b[0]++; if (win) b[1]++; a.by.set(bk, b);
      }
      const out = (a: ReturnType<typeof z>): Window => ({ rounds: a.rounds, wins: a.wins,
        byCell: Object.fromEntries([...a.by.entries()].sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))),
        ...(pooled ? { ret12: String(a.ret), meanD: String(a.mean), varD2: String(a.v) } : {}) });
      epochs.push({ set, epoch: Number(sd.epoch), seedHash: sd.hashedServerSeed, early: out(acc.early), ref: out(acc.ref) });
    }
  }
  onProgress?.(`pass 2: ${epochs.length} epochs × ${SIM_PASS2_NONCES}`);
  return {
    design: { freshSeedRule: FRESH_SEED_RULE, pass1: { seedsPerBoard: PASS1_SEEDS, noncesPerSeed: PASS1_NONCES, grids: [...GRIDS], boards: 'every mine count 1 … N − 1 of every grid, each on its own seed labels', picksPerRound: 'm, the board\'s mines', rtpTileOrder: RTP_TILE_ORDER, serialStatistic: 'pick 0 tile of every round of the grid in census order; upper = 2·tile ≥ N' },
      pass2: { nonces: SIM_PASS2_NONCES, earlyWindow: SIM_PASS2_EARLY_WINDOW_RULE, slot: PASS2_SLOT_RULE, datasets: sets.map(([k]) => `${k}: ${ALL_DATASETS.find(([x]) => x === k)?.[1] ?? '?'}`),
        units: 'byCell = per grid/mines/depth [rounds, wins]; Phase A epochs also carry the pooled return: ret12 = sum of floor(multiplier·10^12) over wins; meanD = sum of mult12·(N−m)·(D/N); varD2 = sum of mult12²·(N−m)·m·(D/N)²; D = 705600' } },
    pass1, pass2: { epochs },
  };
}

export const censusText = (c: Census): string => JSON.stringify(c) + '\n';

if (process.argv[1] && /simulate\.ts$/.test(process.argv[1])) {
  const t0 = Date.now();
  const c = census(ALL_DATASETS.map(([k, f]) => [k, load(f)] as const), (s) => console.log(`  ${s}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`));
  const text = censusText(c);
  const emit = process.env.PF_EMIT === '1';
  const dir = emit ? join(ROOT, 'outputs') : join(ROOT, 'outputs', 'run'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'simulation-results.json'), text);
  console.log(`wrote ${emit ? 'outputs' : 'outputs/run'}/simulation-results.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
