// The per-round replay of HouseBets mines, shared by every dataset (port of rig/mines/verify-mines.py's round loop, whose
// outputs it must agree with). Every check is made against the field DERIVED from the revealed seed; the operator's outcome
// label, multiplier and payout are only compared, never used.
import { picks } from './rng.ts';
import { pay8, multDouble, allowed, units8 } from './rules.ts';
import { GRIDS, MAX_WIN } from './spec.ts';
import type { Dataset, Round, Seed, Game } from './types.ts';

export interface RoundResult {
  idx: number; ok: boolean; bad: string[];
  grid: number; mines: number; stake8: bigint; nonce: number; epochHash: string | null; epochIx: number;
  kind: string; outcome: string | undefined; k: number; payout8: bigint; won: boolean; tile0: number | null; firstPick: number | null;
  field: number[] | null; settledField: number[] | null;
  rows: Record<string, [number, number]>;          // row name -> [ok, total], aggregated by the verifier into profile checks
  closedByServer: boolean; leftValue8: bigint | null; leftK: number;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const g200 = (q: any): Game | null => (q && q.status === 200 && q.response && typeof q.response === 'object' && q.response.game) ? q.response.game : null;

/** Replay one round. `byHash`: the dataset's epochs by server-seed hash (the epoch is the one the SERVER names in its answer). */
export function replayRound(r: Round, byHash: Map<string, { seed: Seed; ix: number }>): RoundResult {
  const rows: Record<string, [number, number]> = {};
  const bad: string[] = [];
  const row = (name: string, cond: boolean, detail = '') => { const a = rows[name] ||= [0, 0]; a[1]++; if (cond) a[0]++; else bad.push(`${name}: round ${r.idx} ${detail}`); };
  const res: RoundResult = { idx: r.idx, ok: false, bad, grid: 0, mines: 0, stake8: 0n, nonce: 0, epochHash: null, epochIx: -1, kind: String(r.spec?.kind),
    outcome: undefined, k: 0, payout8: 0n, won: false, tile0: null, firstPick: null, field: null, settledField: null, rows, closedByServer: !!r.closedByServer, leftValue8: null, leftK: 0 };
  const reqs = r.requests || [];
  // a negative test sends a cash-out with no tile open on purpose (12 Oct file): its refusal (HTTP 400, code 6) is the answer
  // the rules call for, the only refused request a round may hold
  const refusedOnPurpose = (q: any) => r.spec?.kind === 'negative' && q.status === 400 && q.path === '/mines2/action' && q.body?.action === 'cashout' && q.response?.code === 6;
  row('every request answered 200 (no refused or replayed request in the round)', reqs.every((q) => q.status === 200 || refusedOnPurpose(q)) && !(r.replays && (r.replays as unknown[]).length) && !r.skipped, `statuses ${reqs.map((q) => q.status)}`);
  const betq = reqs.find((q) => q.path === '/mines2/bet' && q.status === 200);
  if (!betq) { row('round has its bet', false); return res; }
  const bg = g200(betq)!;
  const h = bg?.fairness?.hashedServerSeed ?? null; res.epochHash = h;
  row("round's pair: the server's bet answer hash == the hash read before the round", !!h && h === r.pre?.hashedServerSeed, `${h} vs ${r.pre?.hashedServerSeed}`);
  const ep = h ? byHash.get(h) : undefined;
  if (!ep || !ep.seed.revealedServerSeed) { row('round is on a revealed epoch', false, `hash ${h}`); return res; }
  res.epochIx = ep.ix;
  const server = ep.seed.revealedServerSeed, client = ep.seed.clientSeed;
  const grid = Number(betq.body.grid), m = Number(betq.body.mines), stake8 = units8(betq.body.amount);
  res.grid = grid; res.mines = m; res.stake8 = stake8;
  let final: any = [...reqs].reverse().find((q) => q.status === 200 && g200(q)?.active === false) ?? null;
  const det0 = r.detail?.response?.game ?? null;
  let srv = false;
  if (!final && r.closedByServer && det0 && det0.active === false) { final = { status: 200, response: r.detail!.response, path: 'game_detail' }; srv = true; }
  if (!final) { row('round settled', false); return res; }
  const G: Game = final.response.game; const fair = G.fairness || {};
  row('settled game grid / mines == the bet, grid published', G.grid === grid && G.mines === m && (GRIDS as readonly number[]).includes(grid), `${G.grid}/${G.mines} vs ${grid}/${m}`);
  row('fairness.version == canonical', fair.version === 'canonical', String(fair.version));
  row('fairness.hashedServerSeed == epoch hash', fair.hashedServerSeed === ep.seed.hashedServerSeed);
  row('fairness.clientSeed == epoch client seed', fair.clientSeed === client, `${fair.clientSeed} vs ${client}`);
  const expNonce = (r.pre?.nonceBefore ?? 0) + 1;
  const nonce = fair.nonce ?? expNonce; res.nonce = Number(nonce);
  row('fairness.nonce == server nonce before the round + 1', Number(fair.nonce) === expNonce, `${fair.nonce} vs ${expNonce}`);
  // The fairness block and round id the recompute uses (the settled answer's) == the one in EVERY other server answer of the
  // round (bet, each action, game_detail), and the capture's own copies (round id, the client seed and hash it read before
  // the round, its outcome label) == the server's. A forged answer anywhere in the round, with the copies left intact, fails.
  {
    const answers = [...reqs.map(g200), det0].filter((x): x is Game => !!x);
    const fb = (x: any) => JSON.stringify([x?.fairness?.version, x?.fairness?.hashedServerSeed, x?.fairness?.clientSeed]);
    row('server answers agree: every answer of the round carries the settled hash, client seed and version', answers.every((x) => fb(x) === fb(G)), `${answers.length} answers`);
    row('server answers agree: every answer of the round carries the settled nonce and round id', answers.every((x) => x.fairness?.nonce === fair.nonce && x.roundId === G.roundId), `${answers.map((x) => x.fairness?.nonce)}`);
    const lab = /^(?:finished at resume: )?(mine|cashout|cleared) after (\d+) tiles?$/.exec(String(r.outcome ?? ''));
    const labelOk = srv ? true : !!lab && lab[1] === G.outcome && Number(lab[2]) === (G.opened || []).length;
    row("capture copies == the server's answer: round id, the client seed and hash read before the round, outcome label", (r.roundId == null || r.roundId === G.roundId)
      && (r.pre?.clientSeed == null || r.pre.clientSeed === fair.clientSeed) && r.pre?.hashedServerSeed === fair.hashedServerSeed && labelOk, `${r.roundId} ${r.outcome} vs ${G.roundId} ${G.outcome}`);
  }
  // Every amount the server answers with is on the platform's 1e-8 grid (an off-grid value is never rounded onto it)
  {
    const onGrid = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && Number(v.toFixed(8)) === v) || (typeof v === 'string' && /^-?\d+(\.\d{1,8})?$/.test(v));
    const amounts: unknown[] = [betq.body.amount];
    for (const q of [...reqs, ...(r.detail ? [r.detail] : [])]) {
      if (q.status !== 200 || !q.response) continue; const x: any = q.response; const g: any = x.game;
      amounts.push(x.balance, x.round?.stake, x.round?.payout, x.round?.delta, x.round?.balance);
      if (g) amounts.push(g.stake, g.payout, g.value, g.maxWin, g.next?.value);
    }
    row('money on the 1e-8 grid: stake sent, and every stake, value, offer value, payout, max win, balance and round record served', amounts.every(onGrid), JSON.stringify(amounts.filter((v) => !onGrid(v))));
  }
  const field = picks(server, client, Number(nonce), grid, m); const fs = new Set(field); const S = grid - m;
  res.field = field; res.settledField = G.field ?? null;
  row('field (mine slots, in draw order) == derived', eq(G.field, field), `served ${JSON.stringify(G.field)} derived ${JSON.stringify(field)}`);
  const cap8 = (G.maxWin ?? MAX_WIN) !== undefined ? units8(G.maxWin ?? MAX_WIN) : null;
  // ── replay every request against the derived field
  let opened: number[] = []; let firstPick: number | null = null;
  for (const q of reqs) {
    const g = g200(q); if (!g) continue;
    if (g.active === true) {   // The offer the game shows before the next tile — its multiplier and value, and whether cash-out is offered
      const kk = (g.opened || []).length; const nx: any = (g as any).next; const o: any = g.options || {};
      const where = q.path === '/mines2/bet' ? 'offer on the bet answer' : 'offer on a later answer';
      const nextOk = kk >= S ? nx == null : nx != null ? nx.multiplier === multDouble(grid, m, kk + 1) && units8(nx.value) === pay8(stake8, grid, m, kk + 1) : !o.reveal;
      row(`${where}: next.multiplier == the exact fraction at depth k + 1 (binary64), next.value == floor(stake × it), cash-out offered iff a tile is open`, nextOk && !!o.cashout === kk >= 1,
        `k ${kk}: next ${JSON.stringify(nx)} vs ${multDouble(grid, m, kk + 1)} / ${pay8(stake8, grid, m, kk + 1)}; options ${JSON.stringify(o)}`);
    }
    if (g.active === true && g.opened && g.opened.length) {   // MINES-17: every intermediate rung, as served
      const kk = g.opened.length;
      row('rung: each open step\'s multiplier == the exact fraction (binary64), value == floor(stake × it)', g.multiplier === multDouble(grid, m, kk) && units8(g.value as any) === pay8(stake8, grid, m, kk),
        `k ${kk}: ${g.multiplier} / ${g.value} vs ${multDouble(grid, m, kk)} / ${pay8(stake8, grid, m, kk)}`);
    }
    if (q.path === '/mines2/bet' && Array.isArray(q.body.tiles)) {   // a bet that names its tiles (auto)
      const exp: number[] = []; let out: string | null = null, hit: number | null = null;
      for (const t of q.body.tiles) {
        if (!allowed(stake8, cap8, grid, m, exp.length + 1)) break;
        if (fs.has(t)) { out = 'mine'; hit = t; break; }
        exp.push(t); if (exp.length === S) { out = 'cleared'; break; }
      }
      if (out === null) out = 'cashout';
      if (q.body.tiles.length) firstPick = q.body.tiles[0];
      row('auto (tiles up front): opened, hit and outcome replay from the derived field', g.active === false && eq(g.opened, exp) && (g.hit ?? null) === hit && g.outcome === out,
        `got ${JSON.stringify(g.opened)} hit ${g.hit} ${g.outcome} expected ${JSON.stringify(exp)} hit ${hit} ${out}`);
      opened = exp;
    } else if (q.path === '/mines2/action' && q.body.action === 'reveal') {
      const t = q.body.tile; if (firstPick === null) firstPick = t;
      if (fs.has(t)) row('reveal of a derived mine ends the round: outcome mine, hit == tile, payout 0', g.active === false && g.outcome === 'mine' && g.hit === t && units8(g.payout as any) === 0n, `tile ${t}`);
      else {
        opened.push(t);
        row('reveal of a derived-safe tile opens it (cleared on the last safe tile)', eq(g.opened, opened) && (g.active === true || (opened.length === S && g.outcome === 'cleared')), `tile ${t}: ${JSON.stringify(g.opened)} ${g.active} ${g.outcome}`);
      }
      if (g.active === true && cap8 !== null && opened.length < S) {
        const o = g.options || {}; const nx = allowed(stake8, cap8, grid, m, opened.length + 1);
        row('options.reveal / options.maxWin follow the max-win rule for the next tile', !!o.reveal === nx && !!o.maxWin === !nx, `next tile ${opened.length + 1}: ${JSON.stringify(o)}`);
      }
    } else if (q.path === '/mines2/action' && q.body.action === 'cashout') {
      row('cashout settles with the opened tiles', g.active === false && g.outcome === 'cashout' && eq(g.opened, opened) && opened.length >= 1, `${JSON.stringify(g.opened)} vs ${JSON.stringify(opened)}`);
    }
  }
  res.firstPick = firstPick;
  const stepped = reqs.map(g200).filter((x): x is Game => !!x);
  const sf = new Set(G.field || []);
  row('mine set invariant across reveals: settled field == derived, no opened tile in it, the hit in it',
    stepped.every((x) => !(x.opened || []).some((t) => sf.has(t))) && (G.hit == null || sf.has(G.hit)) && eq(G.field, field));
  // MINES-10: the outcome follows from the derived field alone
  const k = (G.opened || []).length; res.k = k; res.outcome = G.outcome;
  const openedMine = (G.opened || []).some((t) => fs.has(t));
  const winByField = !openedMine && !(G.hit != null && fs.has(G.hit));
  row('win ⇔ no opened tile is a derived mine; a bust ends on exactly one derived mine', (G.outcome !== 'mine') === winByField && (G.outcome !== 'mine' || (G.hit != null && fs.has(G.hit) && !openedMine)),
    `outcome ${G.outcome}, opened ${JSON.stringify(G.opened)}, hit ${G.hit}`);
  // MINES-17: the same walk named up front (auto) settles identically to the tile-by-tile play
  if (!Array.isArray(betq.body.tiles)) {
    const walk = [...(G.opened || []), ...(G.outcome === 'mine' && G.hit != null ? [G.hit] : [])];
    const exp: number[] = []; let out: string | null = null;
    for (const t of walk) { if (fs.has(t)) { out = 'mine'; break; } exp.push(t); if (exp.length === S) { out = 'cleared'; break; } }
    if (out === null) out = 'cashout';
    const expPayAuto = out === 'mine' ? 0n : pay8(stake8, grid, m, exp.length);
    row('order independence: the tile-by-tile walk named up front settles identically (outcome, opened, payout)', out === G.outcome && eq(exp, G.opened) && expPayAuto === units8(G.payout as any), `auto ${out} ${JSON.stringify(exp)} vs ${G.outcome} ${JSON.stringify(G.opened)}`);
  }
  const expPay = G.outcome === 'mine' ? 0n : pay8(stake8, grid, m, k);
  res.payout8 = units8(G.payout as any); res.won = res.payout8 > 0n; res.tile0 = field.length ? field[0] : null;
  if (srv) {   // the published 24 h rule; the round's last open state as the capture left it
    const left = stepped.filter((x) => x.active === true); const last = left[left.length - 1];
    res.leftK = last ? (last.opened || []).length : 0; res.leftValue8 = last ? units8(last.value as any) : null;
    row('24 h rule (published): left with tiles open -> cashed out by the server at its value', res.leftK >= 1 && G.outcome === 'cashout' && k === res.leftK && res.payout8 === pay8(stake8, grid, m, res.leftK) && res.payout8 === res.leftValue8,
      `left with ${res.leftK} open, value ${last?.value}; server ${G.outcome} with ${k}, payout ${G.payout}`);
  } else {
    row('payout == floor(stake × 99·C(N,k) / (100·C(N−m,k))) at 1e-8, 0 on a mine', res.payout8 === expPay, `served ${G.payout} expected ${expPay}`);
    const rnd = final.response.round;
    if (rnd && typeof rnd === 'object') row('settled round record agrees (roundId, stake, payout)', rnd.roundId === G.roundId && units8(rnd.stake) === stake8 && units8(rnd.payout) === expPay);
    if (k >= 1 && G.outcome !== 'mine') row('served multiplier == the exact fraction 99·C(N,k)/(100·C(N−m,k)) as binary64', G.multiplier === multDouble(grid, m, k), `${G.multiplier} vs ${multDouble(grid, m, k)}`);
    if (det0) row('game_detail agrees (field, opened, outcome, payout, nonce)', eq(det0.field, G.field) && eq(det0.opened, G.opened) && det0.outcome === G.outcome && units8(det0.payout as any) === units8(G.payout as any) && det0.fairness?.nonce === fair.nonce);
  }
  res.ok = bad.length === 0;
  return res;
}

export function epochIndex(d: Dataset): Map<string, { seed: Seed; ix: number }> {
  return new Map(d.seeds.map((s, ix) => [s.hashedServerSeed, { seed: s, ix }]));
}

/** Replay every round of a dataset (or the rounds `keep` selects) and aggregate the rows. */
export function replayDataset(d: Dataset, keep: (r: Round) => boolean = () => true) {
  const byHash = epochIndex(d);
  const results = d.rounds.filter(keep).map((r) => replayRound(r, byHash));
  const rows: Record<string, [number, number]> = {};
  for (const x of results) for (const [k, [a, b]] of Object.entries(x.rows)) { const t = rows[k] ||= [0, 0]; t[0] += a; t[1] += b; }
  return { results, rows, bad: results.flatMap((x) => x.bad), okRounds: results.filter((x) => x.ok).length };
}
