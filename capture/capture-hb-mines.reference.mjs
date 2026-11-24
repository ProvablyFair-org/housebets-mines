#!/usr/bin/env node
/* ============================================================================
 *  HouseBets House Games (new engine) — MINES capture (live bundle mines2)  ·  ProvablyFair.org
 *  REFERENCE COPY, published with the audit package (27 Oct 2026). Comments redacted for publication (names, quotes
 *  and internal paths removed); the code is unchanged. The as-run file (sha256 4bf69ed028f2dd7e8787b7e4af8bf6105ee194e2e79f4d414ee620bd4ebcd330, recorded as
 *  meta.captureScript.sha256 in the five 13 Oct 2026 datasets of this package) is held privately; this copy is not that
 *  file. The 12 Oct 2026 file records the version of the script used that day (sha256 993615d157c2105598b59f8db6a40819a69d744ec095cf71d9a077d864160141); that copy was not kept.
 *  The capture ran inside the logged-in browser tab, bundled with its node: imports replaced by browser shims;
 *  crypto-shim.reference.js is the crypto one (randomBytes = window.crypto.getRandomValues). The imports
 *  below name the capture folder's layout; multistep-common.reference.mjs and hb-capture-lib.reference.mjs are their
 *  reference copies.
 *
 *  API from the game page's bundle platform-housegames-mines2-game.js (sha256 e8e5d68f…):
 *    POST /housegames/mines2/bet     {generation,amount,grid,mines,currency[,tiles]}   (tiles = auto: settles in one call)
 *    POST /housegames/mines2/action  {generation,roundId,seq,action:"reveal",tile} · {…,action:"cashout"}
 *    GET  /housegames/mines2/game    (open round)
 *    GET  /housegames/provably_fair/rounds/mines2/<roundId> → {gameRecordId} → GET /housegames/mines2/game_detail/<id>
 *    GET  /housegames/seeds?gameType=mines2 · POST /housegames/change_seed {gameType:"mines2",clientSeed}
 *
 *  Run from this folder:
 *    1) launch Mines on the site, DevTools → Network → filter "refresh" → Copy as cURL on
 *       POST /_api/housegames/refresh →  pbpaste > refresh.curl        (never copied into any output)
 *    2) node capture-hb-mines.mjs --probe          # anchor + 2 rounds + rotate/reveal, then STOP
 *       python3 -I verify-mines.py outputs/mines-probe-*.json
 *    3) node capture-hb-mines.mjs                  # full plan (--resume after an interruption)
 *    4) ≥ 24 h later: node capture-hb-mines.mjs --check-open
 *  Flags: --stake=0.02 --rotate-every=10 --delay=150 --plan=full|tiny --curl=<file> --outdir=<dir>
 *         --origin=http://127.0.0.1:<port> (mock only) · test-only: --crash-after=<n> --crash-mid=<planIdx>
 *  Supplementary phases (written 12 Oct 2026; see multistep-common.mjs phaseSetup):
 *    --plan=auto1 [--rounds=6500]  Phase A: one auto tile per bet, every grid × every mine count, ≥ the MINES-15 floor
 *    --phase=C                     150 auto bets 25/1, one tile, at 2.00
 *    --phase=D --client-seeds=a,b,c,d [--empty-seed-control]   4 epochs × 50 auto bets under typed seeds
 *    --phase=E                     600 manual multi-reveal rounds (150 per grid), first picks over every tile
 * ==========================================================================*/
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs, checkOrigin, LIVE_ORIGIN, runCapture, makeEngine, makeClient, rint, shuffle, pick, dig, now, writeJsonSafe, phaseSetup, PHASE_EPOCH } from '../multistep-common.mjs';
import { loadAuth } from '../reference/hb-capture-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { flag } = parseArgs();
let PH = null; try { PH = phaseSetup(flag); } catch (e) { console.error('FATAL:', e.message); process.exit(2); }   // null = default run
const STAKE = PH ? PH.stake : Number(flag('stake', 0.02));
const PLAN = PH ? PH.planName : String(flag('plan', 'full'));
const CURRENCY = 1;   // client: currency = fn() = stored currency code, default 1
const SLUG = 'mines2';
const cfg = {
  game: 'mines', apiSlug: SLUG, fairnessSlug: SLUG, schema: 'housebets-mines2-capture-v1',
  scriptFile: 'rig/mines/capture-hb-mines.mjs', scriptSha: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  outDir: String(flag('outdir', join(HERE, 'outputs'))), seedPrefix: 'pfmines', rotateEvery: PH ? PH.rotateEvery : Number(flag('rotate-every', PLAN === 'tiny' ? 2 : 10)),
  origin: checkOrigin(String(flag('origin', LIVE_ORIGIN))), curl: String(flag('curl', join(HERE, 'refresh.curl'))),
  stake: STAKE, delay: Number(flag('delay', 150)), resume: !!flag('resume', false), probe: !!flag('probe', false), planName: PLAN,
  crashAfter: flag('crash-after', null) == null ? null : Number(flag('crash-after')), crashMid: flag('crash-mid', null) == null ? null : Number(flag('crash-mid')),
  verifyScript: 'verify-mines.py', log: (m) => console.log(m), activeOf: (j) => dig(j, 'game.active') === true,
  ...(PH ? { phase: PH.phase, ph: PH } : {}),
};

// ── plan (all choices CSPRNG, drawn once and stored in meta.plan) ────────────
//  every grid the bundle offers (st=[25,36,49,64]); per grid five mine counts: low 1 and 3, mid ≈ 30 %, high grid-3
//  and grid-1; per (grid, mines) three manual rounds with cash-out depth 1, half the safe tiles, all safe tiles
//  (busts happen on the way) and one auto round (tiles picked up front, CSPRNG depth).
const GRIDS = [25, 36, 49, 64];
const countsFor = (gr) => [['low', 1], ['low', 3], ['mid', Math.round(gr * 0.3)], ['high', gr - 3], ['high', gr - 1]];
function plan() {
  const out = [];
  const add = (o) => out.push({ stakeUnits: 1, order: shuffle([...Array(o.grid).keys()]), ...o });
  if (PLAN === 'tiny') {
    add({ phase: 'M', kind: 'manual', grid: 25, band: 'low', mines: 1, depth: rint(1, 25) });
    add({ phase: 'M', kind: 'manual', grid: 36, band: 'mid', mines: 11, depth: 25 });
    add({ phase: 'M', kind: 'manual', grid: 64, band: 'high', mines: 63, depth: 1 });
    add({ phase: 'A', kind: 'auto', grid: 49, band: 'low', mines: 3, depth: rint(1, 47) });
    add({ phase: 'N', kind: 'negative', grid: 25, band: 'low', mines: 2, depth: 1 });
    return out;
  }
  for (const gr of GRIDS) for (const [band, m] of countsFor(gr)) {
    const S = gr - m;
    for (const d of [1, Math.max(1, Math.ceil(S / 2)), S]) add({ phase: 'M', kind: 'manual', grid: gr, band, mines: m, depth: d });
    add({ phase: 'A', kind: 'auto', grid: gr, band, mines: m, depth: rint(1, S + 1) });
  }
  add({ phase: 'N', kind: 'negative', grid: 25, band: 'low', mines: 3, depth: 1 });
  add({ phase: 'N', kind: 'negative', grid: 64, band: 'mid', mines: 19, depth: 2 });
  const shuffled = shuffle(out);
  shuffled.push({ stakeUnits: 1, phase: 'O', kind: 'open', grid: 25, band: 'low', mines: 1, depth: 1, order: shuffle([...Array(25).keys()]) });
  return shuffled;
}

// ── phase plans (supplementary phases, written 12 Oct 2026) ──────────────────────────────────────────────────
//  The Phase A floor is read from the framework profile (MINES-15 floor: "Phase A ≥ N bets per config"). The in-page
//  build embeds only the rig sources, so in the page the pinned copy below is used; meta.phasePlan.floor says which.
const PROFILE = join(HERE, '..', '..', '..', 'pf-audit-framework', 'games', 'mines', 'profile.json');
const FLOOR_PINNED = { value: 50, text: 'All published configurations; Phase A ≥ 50 bets per config' };   // MINES-15 floor as read 12 Oct 2026
function phaseAFloor() {
  try {
    const raw = readFileSync(PROFILE, 'utf8'); const c = (JSON.parse(raw).checks || []).find((x) => x.id === 'MINES-15');
    const m = String(c && c.floor).match(/Phase A\s*≥\s*([\d,]+)/);
    if (!m) throw new Error('no "Phase A ≥ N" in the MINES-15 floor');
    return { value: Number(m[1].replace(/,/g, '')), text: c.floor, source: 'profile.json MINES-15 floor', file: 'pf-audit-framework/games/mines/profile.json', sha256: createHash('sha256').update(raw).digest('hex') };
  } catch (e) { return { ...FLOOR_PINNED, source: `pinned copy of the MINES-15 floor (12 Oct 2026): profile not readable here (${String(e.message).slice(0, 100)})` }; }
}
// the client's payout-cap rule for the FIRST tile, from the static /limits read (same arithmetic as firstTileOverCap)
function capForbidsFirst(staticReads, grid, mines, stake) {
  const lim = (staticReads || {})[`/limits/${SLUG}`] || {}; const cap = Number(lim.maxWin ?? lim.json?.maxWin);
  if (!(cap > 0)) return false;
  const stakeU = BigInt(Math.round(stake * 1e8)), capU = BigInt(Math.round(cap * 1e8));
  return (stakeU * 99n * BigInt(grid)) / (100n * BigInt(grid - mines)) - stakeU > capU;
}
const auto1 = (phase, grid, mines) => ({ stakeUnits: 1, phase, kind: 'auto', grid, mines, depth: 1, order: [rint(0, grid)] });   // first tile CSPRNG over all tiles
function phasePlan(PH, { staticReads, stake, log }) {
  const cells = [], excluded = [];
  for (const gr of GRIDS) for (let m = 1; m < gr; m++) (capForbidsFirst(staticReads, gr, m, stake) ? excluded : cells).push({ grid: gr, mines: m });
  if (excluded.length) log(`  ⚠ the max-win cap forbids the first tile of ${excluded.length} config(s) at stake ${stake}: ${excluded.map((c) => `${c.grid}/${c.mines}`).join(' ')}`);
  if (PH.phase === 'A') {
    // every grid × every legal mine count; each mine count gets ≥ the floor in total over the grids that offer it, then the
    // rest is water-filled so every (grid, mine count) cell gets the same number (± 1, the ± 1 cells CSPRNG-chosen)
    const F = phaseAFloor(), total = PH.rounds ?? 6500;
    log(`Phase A floor (MINES-15): ≥ ${F.value} rounds per mine count · ${F.source} · "${F.text}"`);
    const offering = {}; for (const c of cells) offering[c.mines] = (offering[c.mines] || 0) + 1;
    const n = cells.map((c) => Math.ceil(F.value / offering[c.mines]));
    let left = total - n.reduce((a, b) => a + b, 0);
    if (left < 0) throw new Error(`Phase A: ${total} rounds is below the floor (${total - left} needed for ≥ ${F.value} per mine count)`);
    while (left > 0) {
      const lo = Math.min(...n), at = n.map((v, i) => (v === lo ? i : -1)).filter((i) => i >= 0);
      const up = at.length <= left ? at : shuffle(at).slice(0, left);
      for (const i of up) n[i]++; left -= up.length;
    }
    const plan = shuffle(cells.flatMap((c, i) => Array.from({ length: n[i] }, () => auto1('A', c.grid, c.mines))));
    const perMineCount = {}, perCell = {};
    cells.forEach((c, i) => { perMineCount[c.mines] = (perMineCount[c.mines] || 0) + n[i]; perCell[`${c.grid}/${c.mines}`] = n[i]; });
    const pm = Object.values(perMineCount);
    log(`Phase A plan: ${plan.length} rounds · ${cells.length} (grid, mine count) cells, ${Math.min(...n)}–${Math.max(...n)} each · per mine count ${Math.min(...pm)}–${Math.max(...pm)} (floor ${F.value}) · ${plan.length / PHASE_EPOCH} epochs`);
    return { plan, info: { floor: F, cells: cells.length, excludedByCap: excluded, perCell, perMineCount, minPerCell: Math.min(...n), minPerMineCount: Math.min(...pm),
      firstTile: 'crypto.randomInt over all tiles of the grid', allocation: '≥ floor per mine count over the grids offering it, the rest equal per cell (±1)' } };
  }
  if (PH.phase === 'C') {
    if (excluded.some((c) => c.grid === 25 && c.mines === 1)) throw new Error('Phase C: the cap forbids 25/1 at this stake');
    return { plan: Array.from({ length: 150 }, () => auto1('C', 25, 1)), info: { config: 'grid 25, 1 mine, one auto tile (win chance 24/25)', winsFloor: 100 } };
  }
  if (PH.phase === 'D') {
    const plan = Array.from({ length: PH.clientSeeds.length * PHASE_EPOCH }, () => { const c = pick(cells); return auto1('D', c.grid, c.mines); });
    return { plan, info: { config: 'one auto tile per bet; (grid, mine count) CSPRNG over every playable cell; tile CSPRNG' } };
  }
  // Phase E (MINES-15/17): 150 manual rounds per grid. E1 low mines k 2–3 · E2 mid k 3–5 · E3 high k 2–5 · E4 extreme
  // (grid − 2 mines) k 2 = every safe tile · E5 mixed configs k 1. First picks: whole CSPRNG permutations of the grid's
  // tiles dealt to the rounds in CSPRNG order, so every tile of every grid is a first pick at least once (150 ≥ 64).
  const out = [], firstsPerGrid = {};
  for (const gr of GRIDS) {
    const subs = [['E1', 40, () => pick([1, 3]), () => rint(2, 4)], ['E2', 40, () => pick([Math.round(gr * 0.2), Math.round(gr * 0.3)]), () => rint(3, 6)],
      ['E3', 40, () => Math.round(gr * 0.6), () => rint(2, 6)], ['E4', 10, () => gr - 2, () => 2], ['E5', 20, () => rint(1, gr), () => 1]];
    const specs = [];
    for (const [sub, count, mf, df] of subs) for (let k = 0; k < count; k++) { const m = mf(); specs.push({ sub, mines: m, depth: Math.min(df(), gr - m) }); }
    if (specs.some((x) => capForbidsFirst(staticReads, gr, x.mines, stake))) throw new Error(`Phase E: the cap forbids a planned first tile on grid ${gr}`);
    const firsts = []; while (firsts.length < specs.length) firsts.push(...shuffle([...Array(gr).keys()]));
    shuffle(specs).forEach((x, i) => { const f = firsts[i]; out.push({ stakeUnits: 1, phase: 'E', kind: 'manual', sub: x.sub, grid: gr, mines: x.mines, depth: x.depth, order: [f, ...shuffle([...Array(gr).keys()].filter((t) => t !== f))] }); });
    firstsPerGrid[gr] = new Set(firsts.slice(0, specs.length)).size;
  }
  log(`Phase E plan: ${out.length} manual rounds · first picks per grid ${JSON.stringify(firstsPerGrid)} distinct tiles`);
  return { plan: shuffle(out), info: { perGrid: 150, subPhases: 'E1 mines 1|3 k2–3 ×40 · E2 mines ≈20|30 % k3–5 ×40 · E3 mines ≈60 % k2–5 ×40 · E4 mines grid−2 k2 ×10 · E5 mines CSPRNG k1 ×20', firstPickTilesPerGrid: firstsPerGrid } };
}

// ── one round ────────────────────────────────────────────────────────────────
const g = (j) => dig(j, 'game') || {};
async function bet(hb, E, round, tiles) {
  round.generation = randomUUID();   // bundle: q.generation() from the host's round tracker (format not in this bundle) — UUID here
  const body = { generation: round.generation, amount: STAKE, grid: round.spec.grid, mines: round.spec.mines, currency: CURRENCY };
  if (tiles) body.tiles = tiles;
  const r = await E.req(hb, round, 'POST', `/${SLUG}/bet`, body);
  round.roundId = g(r.json).roundId ?? null;
  return r.json;
}
// every action carries a FRESH generation: the server treats a repeated generation as a replay and answers
// with the cached state (12 Oct live: reveals with the bet's generation returned 200 with nothing opened)
const act = (hb, E, round, cur, action, tile, opts) => E.req(hb, round, 'POST', `/${SLUG}/action`,
  { generation: randomUUID(), roundId: round.roundId, seq: g(cur).seq, action, ...(action === 'reveal' ? { tile } : {}) }, opts);

async function walk(hb, E, round, j, order, depth) {
  for (const t of order) {
    if (g(j).active !== true || (g(j).opened || []).length >= depth) break;
    if ((g(j).opened || []).includes(t)) continue;
    const o = g(j).options || {};
    if (!o.reveal) { round.decisions.push({ at: now(), why: o.maxWin ? 'max-win: reveal not offered' : 'reveal not offered', opened: (g(j).opened || []).length, options: o }); round.maxWinStop = !!o.maxWin; break; }
    j = (await act(hb, E, round, j, 'reveal', t)).json;
  }
  if (g(j).active === true) j = (await act(hb, E, round, j, 'cashout')).json;
  return j;
}
// The client refuses a bet whose first tile already exceeds the max win (bundle `Mp`: "the first tile is over the max
// win"; `Us` returns code "payout-cap" before any request). The rig does the same with /limits/mines2 maxWin and
// records the plan entry as skipped instead of placing a round that could never be cashed out.
const combN = (n, k) => { let r = 1n; for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1); return r; };
function firstTileOverCap(E, s) {
  const lim = E.ds.meta.staticReads?.[`/limits/${SLUG}`] || {};
  const cap = Number(lim.maxWin ?? lim.json?.maxWin);
  if (!(cap > 0)) return false;
  const stakeU = BigInt(Math.round(STAKE * 1e8)), capU = BigInt(Math.round(cap * 1e8));
  return (stakeU * 99n * combN(s.grid, 1)) / (100n * combN(s.grid - s.mines, 1)) - stakeU > capU;
}
async function playRound(hb, E, round) {
  const s = round.spec; let j;
  if (firstTileOverCap(E, s)) { round.skipped = `first tile over the max win at stake ${STAKE} (client refuses this bet: payout-cap)`; round.outcome = 'SKIPPED'; return; }
  if (s.kind === 'auto') j = await bet(hb, E, round, s.order.slice(0, s.depth));
  else {
    j = await bet(hb, E, round);
    if (s.kind === 'negative') {   // spec: cash-out allowed only after one safe step — try it with none opened
      const neg = await act(hb, E, round, j, 'cashout', null, { allowFail: true, negative: 'cashout with no tile opened' });
      round.negativeResult = { status: neg.status, refused: neg.status !== 200 };
      if (neg.status === 200) j = neg.json;
    }
    j = await walk(hb, E, round, j, s.order, s.depth);
  }
  round.outcome = g(j).active ? 'STILL ACTIVE' : `${g(j).outcome} after ${(g(j).opened || []).length} tiles`;
}
async function activeRound(hb) { const r = await hb.get(`/${SLUG}/game`, { allowFail: true }); return r.status === 200 && g(r.json).active === true ? r.json : null; }
async function finishInterrupted(hb, E, round) {
  let j = round.activeAtResume; round.roundId = g(j).roundId;
  round.generation = round.requests.find((q) => q.body?.generation)?.body.generation ?? randomUUID();
  if (!(g(j).options || {}).cashout) {
    const t = shuffle([...Array(g(j).grid).keys()].filter((i) => !(g(j).opened || []).includes(i)))[0];
    round.decisions.push({ at: now(), why: 'resume: nothing opened yet, one reveal', tile: t });
    j = (await act(hb, E, round, j, 'reveal', t)).json;
  }
  if (g(j).active) j = (await act(hb, E, round, j, 'cashout')).json;
  round.outcome = `finished at resume: ${g(j).outcome} after ${(g(j).opened || []).length} tiles`;
}
async function afterRound(hb, E, round) {
  if (!round.roundId) return;
  const a = await hb.get(`/provably_fair/rounds/${SLUG}/${round.roundId}`, { allowFail: true });
  round.detailLookup = { path: `/provably_fair/rounds/${SLUG}/${round.roundId}`, status: a.status, response: a.json };
  const rec = dig(a.json, 'gameRecordId', 'gameRecordID'); if (rec == null) return;
  const d = await hb.get(`/${SLUG}/game_detail/${rec}`, { allowFail: true });
  round.detail = { path: `/${SLUG}/game_detail/${rec}`, status: d.status, response: d.json };
}
async function openRound(hb, E, round) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let j = await bet(hb, E, round);
    j = (await act(hb, E, round, j, 'reveal', round.spec.order[attempt])).json;
    if (g(j).active) { round.outcome = 'left open after one safe tile'; return round; }
    round.outcome = 'mine before the open round could start'; await afterRound(hb, E, round); E.finishRound(round);
    round = await E.startRound(hb, round.planIdx, round.spec, 'OPEN-retry');
  }
  return round;
}
const label = (r) => `${r.spec.kind} ${r.spec.grid}/${r.spec.mines} depth=${r.spec.depth} → ${r.outcome}`;
const G = { roundKey: (j) => dig(j, 'game.roundId') ?? null, plan, playRound, activeRound, finishInterrupted, afterRound, openRound, label, phasePlan,
  staticPaths: [`/limits/${SLUG}`, `/${SLUG}/fairness`] };

async function probe() {
  const E = makeEngine(cfg); const auth = loadAuth(cfg.curl);
  const hb = makeClient(auth, { origin: cfg.origin, game: SLUG, log: cfg.log }); await hb.refresh();
  E.ds.meta.planName = 'probe'; E.ds.meta.kind = 'probe';
  E.ds.meta.staticReads = {}; for (const p of G.staticPaths) { const r = await hb.get(p, { allowFail: true }); E.ds.meta.staticReads[p] = { status: r.status, json: r.json }; }
  let pair = await E.anchor(hb);
  const specs = [{ phase: 'P', kind: 'manual', grid: 25, mines: 3, depth: 1, order: shuffle([...Array(25).keys()]) },
    { phase: 'P', kind: 'auto', grid: 36, mines: 1, depth: 2, order: shuffle([...Array(36).keys()]) }];
  E.ds.meta.plan = specs;
  for (let i = 0; i < specs.length; i++) { const round = await E.startRound(hb, i, specs[i], 'PROBE'); await playRound(hb, E, round); await afterRound(hb, E, round); E.finishRound(round); console.log(`  probe round ${i}: ${label(round)}`); }
  pair = await E.closePair(hb, pair);
  const file = join(cfg.outDir, `mines-probe-${Date.now()}.json`); writeJsonSafe(file, E.ds);
  const first = E.ds.rounds[0].requests[0]?.response;
  console.log('\n── PROBE RESULT (fields observed, not judged) ──');
  console.log(`  bet response keys ${JSON.stringify(Object.keys(first || {}))} · game keys ${JSON.stringify(Object.keys(g(first)))} · fairness ${JSON.stringify(g(first).fairness || null)}`);
  console.log(`  detail lookup ${E.ds.rounds[0].detailLookup?.status} → detail ${E.ds.rounds[0].detail?.status}`);
  console.log(`  anchor ${E.ds.preCapture.anchorOk} · commit ${E.ds.seeds[0].commitmentValid} · chain ${E.ds.seeds[0].chainLinkOk} · witness ${E.ds.seeds[0].clientSeedDrawnAfterCommitment.equalsEpochHash}`);
  console.log(`  probe file → ${file}\n  next: python3 -I verify-mines.py ${file}`);
}

(cfg.probe ? probe() : runCapture(cfg, G)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
