// HouseBets House Games mines (new engine, fairness version "canonical") — verification suite: the 30 checks of the MINES
// profile (profile/profile.json, a byte copy of the framework's games/mines/profile.json 1.0.2, Framework 1.1, its sha256 checked
// at run time; src/profile-map.ts must carry the same rows). Run: npm run verify (Node 22, no install).
// A step that throws is scored FAIL and the run goes on; an exception outside every step still prints every row, exit 1.
// Status by policy: HARD_FAIL → PASS | FAIL; FLAG → PASS | FLAG (origin operator or capture); INFORMATIONAL → INFO;
// GRADED / RELEASE_GATE (package checks) → PASS | GAP, reported, not in the verdict — except a release-gate record
// (outputs/fresh-copy.json, outputs/mutation-results.json) that is missing or not the bytes RELEASE-MANIFEST.json pins: FAIL,
// and the verdict is NOT PROVABLY FAIR. A step that throws is scored FAIL, never skipped (step(), below).
// Verdict, ranked as RTP-CLAIM 1.2.0's rtpClaimVerdict: any FAIL → NOT PROVABLY FAIR (exit 1) > a scored check with no status
// from this run → INCOMPLETE (exit 3; never a pass) > MINES-19 OVERSTATED → RTP FIGURE OVERSTATED (exit 5, Methodology
// v1.1) > an operator-origin FLAG → Conditional Pass (exit 2) > Full Pass (exit 0). A stale verify.js → exit 4, no verdict.
// A capture-origin FLAG is disclosed with a limitation row and is verdict-neutral (policy decided 2026-09-17).
// OBSERVATIONS (printed after the table, computed before the package checks) are facts the profile has no check for;
// they are recorded in the verification record, never scored.
// verify writes only outputs/run/ and never rewrites a pinned artifact.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, load, sha256File, sha256Bytes, readJson, PRIMARY_FILE, PRIMARY_SHA256, PHASE_C_FILE, PHASE_C_SHA256, PHASE_C10_FILE, PHASE_C10_SHA256,
  PHASE_D_FILE, PHASE_D_SHA256, PHASE_E_FILE, PHASE_E_SHA256, H24_FILE, H24_SHA256, EVIDENCE_PINS, EXPECTED_ROUNDS, EXPECTED_SEEDS,
  EXPECTED_EPOCHS, EXPECTED_EPOCH_SIZE, EXPECTED_PHASE_C_ROUNDS, EXPECTED_PHASE_C10_ROUNDS, EXPECTED_PHASE_D_ROUNDS, EXPECTED_PHASE_E_ROUNDS,
  PHASE_A_STAKE, PHASE_C_STAKE, PHASE_C10_STAKE, PHASE_C_BOARD, PHASE_D_SEEDS, NONCE_BASE, PLAN_ROUNDS_PER_BOARD, PLAN_BOARD_FLOOR, ALL_DATASETS } from '../src/loader.ts';
import { picks, positionFromU, sha256Hex } from '../src/rng.ts';
import * as RNG from '../src/rng.ts';
import { comb, multFrac, multDouble, pay8, units8, fracToDouble, survivalComb, survivalProduct, MULT_NUM, MULT_DEN } from '../src/rules.ts';
import { GRIDS, BOARDS, SPEC_BOARDS, SPEC_PAYOUTS, MAX_WIN, MIN_STAKE, RULES } from '../src/spec.ts';
import { PROFILE, PROFILE_SHA256, PROFILE_VERSION, type Policy, type ProfileCheck } from '../src/profile-map.ts';
import { publishedRtp, publishedCoefficient, walletLimits, e01Tables, type RtpPlace } from '../src/exhibits.ts';
import { replayDataset, replayRound, epochIndex, type RoundResult } from '../src/replay.ts';
import { census, censusText, mult12, playedSlots, type Census, type Slot } from '../src/simulate.ts';
import { SIM_ROUNDS_PER_BOARD, pass1Seed, FLOOR_ROUNDS_PER_BOARD, FLOOR_PASS2_NONCES, ALPHA_SCREEN, EDGE_SIGMAS, EDGE_BUFFER, EDGE_MIN_EXPECTED,
  SIM_PASS2_NONCES, SIM_PASS2_ALPHA, SIM_PASS2_STATISTIC, PASS2_D } from '../src/sim-config.ts';
import { chiSquaredPValue, runsStatisticFromCounts, twoSidedNormalP, normalLowerTailP, normalQuantile } from '../src/stats.ts';
import { edgeBandFalseAlarm, FAIL_FALSE_ALARM_CAP, fmtRate } from '../src/false-alarm.ts';
import { PASS2_FALSE_ALARM, PASS2_FALSE_ALARM_POOLED } from '../src/false-alarm-pass2.ts';
import { computeRtpClaim, runRtpClaimGate } from '../src/rtp-settings.ts';
import { RTP_CLAIM_RULE_ENFORCED, rtpClaimVerdict } from '../src/rtp-claim';
import { ARTIFACT_PINS, AUDIT_ID, SITE_VERIFIER_PIN } from '../src/artifact-pins.ts';
import { loadSiteModule, replay as replaySide, exportNames, type Probe } from '../src/site-verifier.ts';
import { fieldDiff, beyondTolerance } from '../src/diff.ts';
import type { Dataset } from '../src/types.ts';
import { codeFingerprint, sourceFingerprint, bundledSourceFingerprint } from '../scripts/fingerprint.mjs';

type Status = 'PASS' | 'FAIL' | 'FLAG' | 'INFO' | 'GAP' | 'NOTRUN' | 'OVERSTATED';
interface Row { id: string; name: string; policy: Policy; status: Status; origin?: 'operator' | 'capture'; detail: string }
const rows: Row[] = [];
// ═══ A step that throws is scored, never skipped ═══
// Every check below runs inside step(). An exception in a step (a file missing, a dataset field null or absent) marks the
// check(s) that step scores FAIL, with the error in the detail, and the next step still runs. A shared input that cannot be
// computed (input()) becomes a value that throws on first use and names itself, so every step that reads it fails on its own
// row. Any such error makes the verdict NOT PROVABLY FAIR (exit 1). An exception outside every step still prints every row,
// each check it left unscored as FAIL, and exits 1.
const RUN_ERRORS: string[] = [];
const TAINT = new Map<string, string>();
const errText = (e: unknown): string => { const x = e as { code?: string; name?: string; message?: string } | null; return `${x?.code ?? x?.name ?? 'Error'}: ${String(x?.message ?? e).split('\n')[0]}`; };
function step(ids: string[], fn: () => void): void {
  try { fn(); } catch (e) {
    const why = errText(e); RUN_ERRORS.push(`${ids.join(', ') || 'a shared computation'}: ${why}`);
    for (const id of ids) if (!TAINT.has(id)) TAINT.set(id, why);
  }
}
function input<T>(name: string, fn: () => T, ...fallback: [T?]): T {
  try { return fn(); } catch (e) {
    const why = errText(e); RUN_ERRORS.push(`input ${name}: ${why}`);
    // a boolean condition that cannot be computed is false (it fails the check it feeds); any other input is poisoned
    if (fallback.length) return fallback[0] as T;
    const poison = (): never => { throw new Error(`input ${name} could not be computed (${why})`); };
    return new Proxy(function () {}, { get: poison, apply: poison, construct: poison, has: poison, ownKeys: poison, getOwnPropertyDescriptor: poison }) as unknown as T;
  }
}
function failRow(id: string, detail: string): void {
  const r = rows.find((x) => x.id === id);
  if (r) { const was = `${r.status}: ${r.detail}`; r.status = 'FAIL'; delete r.origin; r.detail = `${detail} (recorded before the error: ${was})`; }
  else { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail }); }
}
/** Called first in finish(): every check whose step threw becomes FAIL. */
function applyTaint(): void {
  for (const [id, why] of TAINT) failRow(id, `NOT SCORED, the step threw ${why} (an input it reads is missing or malformed); scored FAIL, never skipped`);
  TAINT.clear();
}
/** A release-gate record (outputs/fresh-copy.json, outputs/mutation-results.json) that is missing, not pinned, or not the
 *  bytes RELEASE-MANIFEST.json pins for it: its check is FAIL, and the verdict fails (extraFails). A record that matches its
 *  pin but reports a shortfall stays a GAP. */
function pinFail(id: string, why: string): void {
  const d = `FAIL: the release-gate record is not the one RELEASE-MANIFEST.json pins (${why}); a deleted or edited record fails the verdict`;
  const r = rows.find((x) => x.id === id);
  if (r) { r.status = 'FAIL'; delete r.origin; r.detail = `${d}; ${r.detail}`; }
  else { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail: d }); }
}
/** Verdict-bearing failures outside the scored HARD_FAIL / FLAG rows: a FAIL on a package check (a release-gate record that
 *  is missing or differs from its RELEASE-MANIFEST.json pin) and any run error. */
const extraFails = (): number => rows.filter((r) => r.status === 'FAIL' && r.policy !== 'HARD_FAIL' && r.policy !== 'FLAG').length + RUN_ERRORS.length;
process.on('uncaughtException', (e) => {
  try {
    const why = errText(e); RUN_ERRORS.push(`the run stopped outside any step: ${why}`);
    for (const c of PROFILE) if (!rows.some((r) => r.id === c.id) && !TAINT.has(c.id)) TAINT.set(c.id, `${why}; the run stopped before this check`);
    finish();
  } catch (e2) { console.log(`VERDICT: NOT PROVABLY FAIR — the verifier stopped: ${errText(e)}; ${errText(e2)}`); }
  process.exit(1);
});
const observations: string[] = [];
// ═══ The step list is bound to the framework profile the MANIFEST cites ═══
// profile/profile.json is a byte copy of the framework's games/mines/profile.json; its sha256 must equal PROFILE_SHA256 (the
// hash MANIFEST.md and RELEASE-MANIFEST.json cite). The scored check list and every check's policy are taken from THAT file,
// and src/profile-map.ts must carry the same rows (id, name, layer, kind, policy). A missing or altered profile file, a row
// missing from src/profile-map.ts or one relabelled there → INCOMPLETE (exit 3), never a pass; a relabelled step still runs
// under the profile's own policy, so forged data behind it still FAILs.
const PROFILE_FILE = 'profile/profile.json';
const binding = (() => {
  const issues: string[] = []; let sha: string | null = null; let checks: ProfileCheck[] | null = null; let version: string | null = null;
  try {
    const raw = readFileSync(join(ROOT, PROFILE_FILE)); sha = sha256Bytes(raw); const j = JSON.parse(raw.toString('utf8')); version = String(j.profileVersion);
    checks = j.checks.map((c: any) => ({ id: c.id, name: c.name, layer: c.layer, kind: c.kind, policy: c.policy }));
  } catch (e) { issues.push(`${PROFILE_FILE} unreadable (${(e as Error).message.split('\n')[0]})`); }
  if (sha !== null && sha !== PROFILE_SHA256) issues.push(`${PROFILE_FILE} sha256 ${sha.slice(0, 12)}… is not the cited profile ${PROFILE_SHA256.slice(0, 12)}…`);
  if (version !== null && version !== PROFILE_VERSION) issues.push(`profile version ${version} is not the cited ${PROFILE_VERSION}`);
  if (checks) {
    for (const c of checks) { const l = PROFILE.find((x) => x.id === c.id);
      if (!l) issues.push(`${c.id} missing from src/profile-map.ts`);
      else if (l.policy !== c.policy || l.name !== c.name || l.kind !== c.kind || l.layer !== c.layer) issues.push(`${c.id} relabelled in src/profile-map.ts (${l.policy}, profile ${c.policy})`); }
    for (const l of PROFILE) if (!checks.some((c) => c.id === l.id)) issues.push(`${l.id} in src/profile-map.ts is not in the profile`);
  }
  return { ok: issues.length === 0, issues, sha, checks: checks ?? PROFILE };
})();
const prof = (id: string) => { const p = binding.checks.find((c) => c.id === id); if (!p) throw new Error(`no profile check ${id}`); return p; };
/** Record a check by its profile policy. `ok` false → FAIL / FLAG / GAP; INFORMATIONAL is always INFO. */
function record(id: string, ok: boolean, detail: string, origin: 'operator' | 'capture' = 'operator') {
  const p = prof(id); let status: Status;
  if (p.policy === 'INFORMATIONAL') status = 'INFO';
  else if (p.policy === 'HARD_FAIL') status = ok ? 'PASS' : 'FAIL';
  else if (p.policy === 'FLAG') status = ok ? 'PASS' : 'FLAG';
  else status = ok ? 'PASS' : 'GAP';
  rows.push({ id, name: p.name, policy: p.policy, status, ...(status === 'FLAG' ? { origin } : {}), detail });
}
/** RTP-CLAIM 1.2.0 (Methodology v1.1; src/rtp-claim-switch.ts ON): the -19 status. `ok` carries the step's own
 *  conditions besides the rule (the exact derivation, the claim read from the exhibits): if one fails, the profile's policy
 *  applies as before. With those clean the rule decides: PASS, or OVERSTATED for a house-side miss of the published figure
 *  (verdict RTP FIGURE OVERSTATED, exit 5 — never NOT PROVABLY FAIR, the draws are checked by the other steps). A committed
 *  RTP table that does not equal this run's is a reproduction failure: FAIL, whatever the rule says. */
function recordRtpClaim(id: string, ok: boolean, gate: { status: 'INFO' | 'PASS' | 'OVERSTATED' | 'FAIL'; tableMatches: boolean }, detail: string) {
  const p = prof(id);
  if (!gate.tableMatches || gate.status === 'FAIL') { rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail }); return; }
  // An RTP miss is decided by the rule alone — OVERSTATED wins over every other condition of the step
  if (gate.status === 'OVERSTATED') { rows.push({ id, name: p.name, policy: p.policy, status: 'OVERSTATED', detail }); return; }
  if (!ok) { record(id, false, detail); return; }
  rows.push({ id, name: p.name, policy: p.policy, status: gate.status, detail });
}
/** A HARD_FAIL / FLAG check whose only shortfall is an auditor-side capture gap: a capture-origin FLAG (verdict-neutral). */
const captureFlag = (id: string, detail: string) => { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FLAG', origin: 'capture', detail }); };
const pct = (a: number, b: number) => `${a}/${b}`;
/** The scored check list the verdict is bound to — every HARD_FAIL and FLAG check of the profile (profile/profile.json), each recorded exactly once. */
const EXPECTED_SCORED = binding.checks.filter((c) => c.policy === 'HARD_FAIL' || c.policy === 'FLAG').map((c) => c.id);
const EXPECTED_STEPS = EXPECTED_SCORED.length;   // compared with the executed scored-check count in finish() (scored.length vs EXPECTED_STEPS)
const t0 = Date.now();

// ═══ MINES-26 dataset & config pins — before anything reads the data ═══
const dataPins: [string, string][] = [[PRIMARY_FILE, PRIMARY_SHA256], [PHASE_C_FILE, PHASE_C_SHA256], [PHASE_C10_FILE, PHASE_C10_SHA256],
  [PHASE_D_FILE, PHASE_D_SHA256], [PHASE_E_FILE, PHASE_E_SHA256], [H24_FILE, H24_SHA256]];
const pinBad = [...dataPins, ...EVIDENCE_PINS].filter(([f, h]) => sha256File(f) !== h);
if (pinBad.length) { record('MINES-26', false, `mismatch: ${pinBad.map(([f]) => f).join(', ')} — abort before any step`); finish(); process.exit(1); }
// The exhibits are pin-checked; every constant that stays in src/ must equal the exhibit's value, and the published
// return must parse from every place that states it. A mismatch is a reproduction failure (FAIL, exit 1).
let PUB: { rtp: string; agree: boolean; places: RtpPlace[] } | null = null;
step(['MINES-26'], () => {
  const bad: string[] = [];
  try { PUB = publishedRtp(); } catch (e) { bad.push((e as Error).message); }
  try { const lim = walletLimits();
    if (units8(MIN_STAKE) !== units8(lim.minBet)) bad.push(`src/spec.ts MIN_STAKE ${MIN_STAKE} ≠ E03 wallet.minBet ${lim.minBet}`);
    if (units8(MAX_WIN) !== units8(lim.maxWin)) bad.push(`src/spec.ts MAX_WIN ${MAX_WIN} ≠ E03 wallet.maxWin ${lim.maxWin}`);
  } catch (e) { bad.push(`E03 wallet limits unreadable (${(e as Error).message})`); }
  const co = publishedCoefficient(); const dec = (s: string | null): [bigint, bigint] | null => { const m = s ? /^(\d+)(?:\.(\d+))?$/.exec(s) : null; return m ? [BigInt(m[1] + (m[2] ?? '')), 10n ** BigInt((m[2] ?? '').length)] : null; };
  const fr = co.e01 ? co.e01.split('/').map(BigInt) : null, d2 = dec(co.e02);
  if (!fr || fr[0] * MULT_DEN !== MULT_NUM * fr[1]) bad.push(`E01 "multiplier" coefficient ${co.e01} ≠ src/rules.ts ${MULT_NUM}/${MULT_DEN}`);
  if (!d2 || d2[0] * MULT_DEN !== MULT_NUM * d2[1]) bad.push(`E02 rulesMinesFormula coefficient ${co.e02} ≠ src/rules.ts ${MULT_NUM}/${MULT_DEN}`);
  const tb = e01Tables(); const J = JSON.stringify;
  if (J(tb.grids) !== J(GRIDS)) bad.push(`src/spec.ts GRIDS ≠ E01 "grids"`);
  const exKeys = (x: any) => J([x.serverSeed, x.clientSeed, x.nonce, x.grid, x.mines, x.field]);
  if (J((tb.examples ?? []).map(exKeys)) !== J(SPEC_BOARDS.map(exKeys))) bad.push('src/spec.ts SPEC_BOARDS ≠ E01 "examples"');
  const payKeys = (x: any) => J([x.grid, x.mines, x.opened, x.multiplier, String(units8(x.payout))]);
  if (J((tb.payouts ?? []).map(payKeys)) !== J(SPEC_PAYOUTS.map(payKeys))) bad.push('src/spec.ts SPEC_PAYOUTS ≠ E01 "payouts"');
  record('MINES-26', bad.length === 0, `${dataPins.length} datasets + ${EVIDENCE_PINS.length} evidence exhibits match their sha256 pinned in src/loader.ts; the figures checks compare against, read from the exhibits: MIN_STAKE ${MIN_STAKE} == E03 wallet.minBet, MAX_WIN ${MAX_WIN} == E03 wallet.maxWin, multiplier coefficient ${MULT_NUM}/${MULT_DEN} == E01 "multiplier" (${co.e01}) and E02 rulesMinesFormula (${co.e02}), GRIDS, SPEC_BOARDS and SPEC_PAYOUTS == E01, the published return parses from ${PUB ? PUB.places.map((p) => `${p.where} (${p.rtp})`).join(' and ') : 'NO place'}: ${bad.length === 0}${bad.length ? ' — ' + bad.join('; ') : ''}`);
  if (!PUB) { finish(); process.exit(1); }
});

const ds = input('ds', () => (load(PRIMARY_FILE))), pC = input('pC', () => (load(PHASE_C_FILE))), pC10 = input('pC10', () => (load(PHASE_C10_FILE))), pD = input('pD', () => (load(PHASE_D_FILE))), pE = input('pE', () => (load(PHASE_E_FILE))), h24 = input('h24', () => (load(H24_FILE)));
const SCORED: [string, Dataset][] = input('SCORED', () => ([['A', ds], ['C', pC], ['C $10', pC10], ['D', pD], ['E', pE]]));
const rp = input('rp', () => (new Map(SCORED.map(([k, d]) => [k, replayDataset(d)]))));
// The 12 Oct file: every round settled inside its own record is recomputed round by round (MINES-03/04 answer-agreement rows,
// 07, 10, 11, 13, 14, 17), the round the server finished under the 24 h rule included. The one round whose record was split in
// two by a resumed finish (the same roundId on two records: a still-active record and a refused re-bet followed by the
// finish) is not replayed; it is counted in MINES-16's reconciliation. The file's pairs are epochs of 10 played before the
// Phase A design, so the population and pair-structure checks (02, 04's epoch rule, 05) do not read it.
const O12 = '12 Oct';
const ridRecords = new Map<string, number>(); step(['MINES-05'], () => { for (const r of h24.rounds) if (r.roundId) ridRecords.set(r.roundId, (ridRecords.get(r.roundId) || 0) + 1); });
const splitRecords = input('splitRecords', () => (h24.rounds.filter((r) => (ridRecords.get(r.roundId!) || 0) > 1)));
step(['MINES-05'], () => { rp.set(O12, replayDataset(h24, (r) => (ridRecords.get(r.roundId!) || 0) === 1)); });
const R = (k: string) => rp.get(k)!;
/** [ok, total] of every replay row whose name starts with `prefix`, over the named datasets. */
function agg(keys: string[], prefix: string): [number, number] {
  let a = 0, b = 0; for (const k of keys) for (const [name, [x, y]] of Object.entries(R(k).rows)) if (name.startsWith(prefix)) { a += x; b += y; } return [a, b];
}
const ALL = input('ALL', () => (SCORED.map(([k]) => k)));
const ALLR = input('ALLR', () => ([...ALL, O12]));   // every replayed round: the 9,600 of the 13 Oct phases and the 12 Oct rounds settled in their own record
const full = (x: [number, number]) => x[1] > 0 && x[0] === x[1];
const fmt = (x: [number, number]) => pct(x[0], x[1]);
const betOf = (r: Dataset['rounds'][number]) => r.requests.find((q) => q.path === '/mines2/bet' && q.status === 200)!;
const rowOk = (x: RoundResult, prefix: string) => Object.entries(x.rows).filter(([n]) => n.startsWith(prefix)).every(([, [a, b]]) => a === b);
const failRows = (k: string) => ['round has its bet', 'round is on a revealed epoch', 'round settled'].map((p) => agg([k], p)[1]).reduce((s, v) => s + v, 0);

// ═══ MINES-05 population & epoch size (G-BIND) ═══
step(['MINES-05'], () => {
  const perEpoch = (d: Dataset, k: string) => { const m = new Map<string, number>(); for (const x of R(k).results) if (x.epochHash) m.set(x.epochHash, (m.get(x.epochHash) || 0) + 1); return m; };
  const pe = perEpoch(ds, 'A'); const sizesOk = [...pe.values()].every((n) => n === EXPECTED_EPOCH_SIZE);
  const onRevealed = ds.rounds.length - failRows('A');
  const shapeA = ds.rounds.filter((r) => { const b = betOf(r).body; return r.spec?.kind === 'auto' && Array.isArray(b.tiles) && b.tiles.length === 1 && units8(b.amount) === units8(PHASE_A_STAKE); }).length;
  const sup: [string, Dataset, number][] = [['C', pC, EXPECTED_PHASE_C_ROUNDS], ['C $10', pC10, EXPECTED_PHASE_C10_ROUNDS], ['D', pD, EXPECTED_PHASE_D_ROUNDS], ['E', pE, EXPECTED_PHASE_E_ROUNDS]];
  const supOk = sup.map(([k, d, n]) => { const m = perEpoch(d, k); return { k, n: d.rounds.length, want: n, epochs: m.size, whole: [...m.values()].every((v) => v === EXPECTED_EPOCH_SIZE) && m.size === d.seeds.length }; });
  const ok = ds.rounds.length === EXPECTED_ROUNDS && ds.seeds.length === EXPECTED_SEEDS && pe.size === EXPECTED_EPOCHS && sizesOk && onRevealed === EXPECTED_ROUNDS
    && shapeA === EXPECTED_ROUNDS && supOk.every((s) => s.n === s.want && s.whole);
  record('MINES-05', ok, `Phase A ${ds.rounds.length} rounds / ${ds.seeds.length} seeds / ${pe.size} epochs (by the hash in the server's bet answer), every epoch exactly ${EXPECTED_EPOCH_SIZE}: ${sizesOk}; ${pct(onRevealed, EXPECTED_ROUNDS)} on a revealed epoch; ${pct(shapeA, EXPECTED_ROUNDS)} one auto bet naming ONE tile at ${PHASE_A_STAKE}; supplementary ${supOk.map((s) => `${s.k} ${s.n} in ${s.epochs} whole epochs of ${EXPECTED_EPOCH_SIZE}: ${s.n === s.want && s.whole}`).join(', ')} — against src/loader.ts constants, never meta; the 12 Oct file is not part of this population (its rounds are recomputed one by one in MINES-03, 04, 07, 10, 11, 13, 14, 17 and reconciled in MINES-16, never counted here)`);
});

// ═══ MINES-01 seed hash integrity (every revealed seed of every dataset, and each pre-capture reveal) ═══
step(['MINES-01'], () => {
  const sets = [...SCORED.map(([, d]) => d), h24];
  const all = sets.flatMap((d) => d.seeds);
  const ok = all.filter((s) => sha256Hex(s.revealedServerSeed) === s.hashedServerSeed).length;
  const primOk = ds.seeds.filter((s) => sha256Hex(s.revealedServerSeed) === s.hashedServerSeed).length;
  const pre = sets.filter((d) => d.preCapture?.revealedServerSeed && sha256Hex(d.preCapture.revealedServerSeed) === d.preCapture.hashedServerSeed).length;
  record('MINES-01', ok === all.length && primOk === EXPECTED_SEEDS && pre === sets.length, `sha256(utf8(revealed)) == committed (E01 encoding): ${pct(primOk, EXPECTED_SEEDS)} Phase A seeds, ${pct(ok, all.length)} across A, C, C $10, D, E and the 12 Oct file; pre-capture reveals ${pct(pre, sets.length)}; 0 rounds on an unrevealed seed`);
});

// ═══ MINES-02 forward commitment chain, anchored before epoch 0 and closed after the last ═══
step(['MINES-02'], () => {
  const chain = (d: Dataset) => {
    let n = 0; for (let i = 0; i + 1 < d.seeds.length; i++) if (d.seeds[i].hashedNextServerSeed === d.seeds[i + 1].hashedServerSeed) n++;
    const anchor = d.preCapture?.hashedNextServerSeed === d.seeds[0].hashedServerSeed;
    const post = d.meta?.postCapture?.activePair; const end = !!post && d.seeds[d.seeds.length - 1].hashedNextServerSeed === post.hashedServerSeed;
    return { n, of: d.seeds.length - 1, anchor, end, ok: n === d.seeds.length - 1 && anchor && end };
  };
  const c = SCORED.map(([k, d]) => ({ k, ...chain(d) }));
  record('MINES-02', c.every((x) => x.ok) && c[0].n === EXPECTED_SEEDS - 1, c.map((x) => `${x.k} ${x.n}/${x.of} links, pre-capture anchor ${x.anchor}, last next-hash == the pair active after the capture ${x.end}`).join('; ') + ' — recomputed from the raw hashes, never from the capture\'s booleans');
});

// ═══ MINES-03 hash consistency within epoch ═══
step(['MINES-03'], () => {
  const per = (k: string) => {
    const by = new Map<string, RoundResult[]>(); for (const x of R(k).results) if (x.epochHash) { const a = by.get(x.epochHash) || []; a.push(x); by.set(x.epochHash, a); }
    return [...by.values()].filter((a) => a.every((x) => rowOk(x, "round's pair") && rowOk(x, 'fairness.hashedServerSeed') && rowOk(x, 'fairness.clientSeed'))).length;
  };
  const a = per('A'); const sup = ['C', 'C $10', 'D', 'E'].map((k) => [k, per(k), SCORED.find(([n]) => n === k)![1].seeds.length] as const);
  const agree = agg(ALLR, 'server answers agree: every answer of the round carries the settled hash'), copies = agg(ALLR, 'capture copies');
  record('MINES-03', a === EXPECTED_EPOCHS && sup.every(([, n, s]) => n === s) && full(agree) && full(copies), `${pct(a, EXPECTED_EPOCHS)} Phase A epochs: every round's bet answer carries the hash read before it, and its settled fairness block the epoch's hash and client seed; ${sup.map(([k, n, s]) => `${k} ${n}/${s}`).join(', ')}; every server answer of a round (bet, each action, game_detail) carries the same hash, client seed and version as the settled block the recompute uses: ${fmt(agree)} rounds (A, C, C $10, D, E, 12 Oct); the capture's own copies (round id, client seed and hash read before the round, outcome label) == the server's answer: ${fmt(copies)}`);
});

// ═══ MINES-04 nonce continuity ═══
step(['MINES-04'], () => {
  const per = (k: string, d: Dataset) => {
    let ok = 0; const bad: string[] = []; const byHash = new Map<string, number[]>();
    for (const x of R(k).results) if (x.epochHash) { const a = byHash.get(x.epochHash) || []; a.push(x.nonce); byHash.set(x.epochHash, a); }
    for (const s of d.seeds) {
      const ns = (byHash.get(s.hashedServerSeed) || []).slice().sort((a, b) => a - b);
      if (ns.length === EXPECTED_EPOCH_SIZE && ns.every((n, i) => n === NONCE_BASE + i) && Number(s.serverNonceAtRotation) === ns.length) ok++; else bad.push(String(s.epoch));
    }
    return { ok, of: d.seeds.length, bad };
  };
  const res = SCORED.map(([k, d]) => ({ k, ...per(k, d) }));
  const step = agg(ALL, 'fairness.nonce'), agreeN = agg(ALLR, 'server answers agree: every answer of the round carries the settled nonce'), step12 = agg([O12], 'fairness.nonce');
  record('MINES-04', res.every((r) => r.ok === r.of) && res[0].ok === EXPECTED_EPOCHS && full(step) && full(agreeN) && full(step12), `${res.map((r) => `${r.k} ${r.ok}/${r.of}`).join(', ')} epochs: nonces exactly ${NONCE_BASE}..${EXPECTED_EPOCH_SIZE}, once each, no gap, repeat or reorder, and N == the server's nonce read at rotation; every round's nonce == the server's count before it + 1: ${fmt(step)} (12 Oct ${fmt(step12)}); every server answer of a round carries the settled nonce and round id: ${fmt(agreeN)} rounds${res.some((r) => r.bad.length) ? `; bad epochs ${res.map((r) => r.bad.join(',')).join(' ')}` : ''}`);
});

// ═══ MINES-07 outcome recomputation (every round, every dataset) ═══
step(['MINES-07'], () => {
  const fA = agg(['A'], 'field (mine slots'), autoA = agg(['A'], 'auto (tiles up front)');
  const sup = ['C', 'C $10', 'D', 'E', O12].map((k) => [k, agg([k], 'field (mine slots')] as const);
  const okRounds = [...SCORED.map(([k, d]) => [k, R(k).okRounds, d.rounds.length] as const), [O12, R(O12).okRounds, R(O12).results.length] as const];
  const ok = fA[0] === EXPECTED_ROUNDS && fA[1] === EXPECTED_ROUNDS && full(autoA) && sup.every(([, x]) => full(x)) && okRounds.every(([, a, b]) => a === b);
  record('MINES-07', ok, `the mine field derived from the revealed seed (E01: HMAC-SHA256 blocks, 4-byte draws, floor(u·n/2^32) among the tiles left) == the served field IN DRAW ORDER: Phase A ${fmt(fA)} (coverage == expectedRounds ${EXPECTED_ROUNDS}), ${sup.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; Phase A auto replay (opened, hit, outcome from the derived field) ${fmt(autoA)}; rounds with every row clean ${okRounds.map(([k, a, b]) => `${k} ${a}/${b}`).join(', ')} (12 Oct: the ${R(O12).results.length} records of the ${h24.rounds.length} that hold a whole round, the 24 h round included; ${splitRecords.length} records of one round split by a resumed finish not replayed, counted in MINES-16)${[...ALLR].flatMap((k) => R(k).bad).length ? ' — ' + [...ALLR].flatMap((k) => R(k).bad).slice(0, 3).join('; ') : ''}`);
});

// ═══ MINES-08 draw bias bound: census of src/rng.ts positionFromU over all 2^32 values of u, for every range n = 2 … 64 ═══
step(['MINES-08'], () => {
  const T = 4294967296; let worst = 0, worstN = 0, monotone = true, sums = true; let minC = T, maxC = 0;
  for (let n = 2; n <= 64; n++) {
    const first = (j: number) => { let lo = 0, hi = T; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (positionFromU(mid, n) >= j) hi = mid; else lo = mid + 1; } return lo; };
    const f = Array.from({ length: n + 1 }, (_, j) => (j === n ? T : first(j)));
    if (positionFromU(0, n) !== 0 || positionFromU(T - 1, n) !== n - 1) monotone = false;
    let total = 0;
    for (let j = 0; j < n; j++) {
      const c = f[j + 1] - f[j]; total += c; if (n === 25) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
      if (c <= 0 || positionFromU(f[j], n) !== j || positionFromU(f[j + 1] - 1, n) !== j) monotone = false;
      const dev = Math.abs(c * n - T) / (n * T); if (dev > worst) { worst = dev; worstN = n; }
    }
    if (total !== T) sums = false;
  }
  record('MINES-08', monotone && sums && worst <= 2 ** -32, `count of src/rng.ts positionFromU over the 2^32 values of u, taken from the two ends of each outcome's interval (found by binary search and checked through the function; the values between the ends are not enumerated, so the count is exact for a map that is monotone in u) for every range n = 2 … 64 (every draw a board of 25, 36, 49 or 64 tiles makes): counts sum to 2^32 and the interval ends are in order: ${monotone && sums}; worst |P(j) − 1/n| = ${worst.toExponential(4)} (n = ${worstN}) ≤ 2^-32 = ${(2 ** -32).toExponential(4)}; e.g. n = 25: every position gets ${minC} or ${maxC} values (no rejection; u·n/2^32 is exact in binary64)`);
});

// ═══ MINES-09 RNG reference vectors (E01 published examples + a captured round) — package check ═══
step(['MINES-09'], () => {
  const b = SPEC_BOARDS.filter((x) => JSON.stringify(picks(x.serverSeed, x.clientSeed, x.nonce, x.grid, x.mines)) === JSON.stringify(x.field)).length;
  const p = SPEC_PAYOUTS.filter((x) => { const [a, d] = multFrac(x.grid, x.mines, x.opened); const [n, q] = x.multiplier.split('/').map(BigInt); return a * q === d * n && pay8(100000000n, x.grid, x.mines, x.opened) === units8(x.payout); }).length;
  const r0 = ds.rounds[0]; const g = betOf(r0).response.game; const s0 = ds.seeds.find((s) => s.hashedServerSeed === g.fairness.hashedServerSeed)!;
  const capOk = JSON.stringify(picks(s0.revealedServerSeed, s0.clientSeed, Number(g.fairness.nonce), g.grid, g.mines)) === JSON.stringify(g.field) && g.multiplier === multDouble(g.grid, g.mines, 1);
  record('MINES-09', b === SPEC_BOARDS.length && p === SPEC_PAYOUTS.length && capOk, `the ${SPEC_BOARDS.length} worked boards of HouseBets' published spec (E01 "examples") ${pct(b, SPEC_BOARDS.length)}; its ${SPEC_PAYOUTS.length} worked multipliers and unit payouts (E01 "payouts") ${pct(p, SPEC_PAYOUTS.length)}; captured round 0 (grid ${g.grid}, ${g.mines} mines, ×${g.multiplier}) recomputes: ${capOk}; also tests/rng.test.ts`);
});

// ═══ MINES-06 client-seed influence, Phase D recomputation, client-seed generator ═══
step(['MINES-06'], () => {
  /** P(two independent seeds give the same ordered field of m mines on N tiles) = 1 / (N·(N−1)···(N−m+1)). */
  const pSame = (N: number, m: number) => { let p = 1; for (let i = 0; i < m; i++) p /= N - i; return p; };
  let changed = 0, lam = 0; const byHash = epochIndex(ds);
  for (const x of R('A').results) {
    const s = byHash.get(x.epochHash!)!.seed; lam += pSame(x.grid, x.mines);
    if (JSON.stringify(picks(s.revealedServerSeed, s.clientSeed + '#wrong', x.nonce, x.grid, x.mines)) !== JSON.stringify(x.settledField)) changed++;
  }
  const coll = R('A').results.length - changed, collBound = lam + 5 * Math.sqrt(lam) + 5;
  const seedsInOrder = pD.seeds.map((s) => s.clientSeed);
  const playerSet = PHASE_D_SEEDS.every((x, i) => seedsInOrder[i] === x) && new Set(seedsInOrder).size >= 2;
  const dIx = epochIndex(pD); let dChanged = 0, dLam = 0;
  for (const x of R('D').results) {
    const e = dIx.get(x.epochHash!)!; const prev = e.ix === 0 ? pD.preCapture?.clientSeed : pD.seeds[e.ix - 1].clientSeed;
    dLam += pSame(x.grid, x.mines);
    if (prev && JSON.stringify(picks(e.seed.revealedServerSeed, prev, x.nonce, x.grid, x.mines)) !== JSON.stringify(x.settledField)) dChanged++;
  }
  const dClean = R('D').okRounds;
  const others = [ds, pC, pC10, pE].flatMap((d) => d.seeds);
  const csprng = others.filter((s) => s.clientSeedSource === 'node:crypto randomBytes(16) hex').length;
  const after = others.filter((s) => { const w = s.clientSeedDrawnAfterCommitment; return !!w && w.committedHash === s.hashedServerSeed && !!w.clientSeedDrawnAt && !!w.commitmentReadAt && Date.parse(w.clientSeedDrawnAt) >= Date.parse(w.commitmentReadAt); }).length;
  const esc = readJson('evidence/E06-mines-empty-seed-control-2026-10-13.json').record;
  const ok = changed > 0 && coll <= collBound && dClean === pD.rounds.length && playerSet && R('D').results.length - dChanged <= dLam + 5 * Math.sqrt(dLam) + 5 && csprng === others.length && after === others.length && esc.status === 400 && esc.accepted === false;
  record('MINES-06', ok, `a wrong client seed changes ${pct(changed, R('A').results.length)} Phase A fields (${coll} identical, expected ${lam.toFixed(2)} — mostly 1-mine boards — bound ${collBound.toFixed(2)}); Phase D: player-set seeds ${JSON.stringify(seedsInOrder)} (predictable, disclosed DL-1, all 4 epochs exposed), ${pct(dClean, pD.rounds.length)} rounds replay clean, ${pct(dChanged, pD.rounds.length)} fields differ under the previous client seed (expected identical ${dLam.toFixed(2)}); phases A, C, C $10, E client seeds LABELLED by the capture as 'node:crypto randomBytes(16) hex' ${pct(csprng, others.length)} (a label match; a redacted reference copy of the capture code is in capture/, the as-run game script is held privately, DL-1), each drawn at or after the read of the hash it plays under ${pct(after, others.length)}; empty-seed control: server refused, HTTP ${esc.status} (E06)`);
});

// ═══ MINES-10 win condition & reveal-sequence consistency ═══
step(['MINES-10'], () => {
  const w = agg(ALLR, 'win ⇔'), mineRev = agg(ALLR, 'reveal of a derived mine'), auto = agg(ALLR, 'auto (tiles up front)');
  let wins1 = 0, wins = 0, busts0 = 0, busts = 0;
  for (const r of ds.rounds) {
    const g = [...r.requests].reverse().find((q) => q.status === 200 && q.response?.game?.active === false)!.response.game; const t = betOf(r).body.tiles[0];
    if (g.outcome === 'mine') { busts++; if ((g.opened || []).length === 0 && g.hit === t) busts0++; } else { wins++; if ((g.opened || []).length === 1 && g.opened[0] === t && g.hit == null) wins1++; }
  }
  record('MINES-10', full(w) && full(mineRev) && full(auto) && wins1 === wins && busts0 === busts, `win ⇔ no opened tile is a derived mine, a bust ends on exactly one derived mine — from the recomputed field, never the outcome label: ${fmt(w)} rounds (A, C, C $10, D, E, 12 Oct); a reveal of a derived mine ends the round with payout 0: ${fmt(mineRev)}; auto bets settle as the derived field says: ${fmt(auto)}; Phase A depth: ${pct(wins1, wins)} wins opened exactly the one chosen tile, ${pct(busts0, busts)} busts opened none and hit the chosen tile`);
});

// ═══ MINES-11 payout arithmetic ═══
step(['MINES-11'], () => {
  const p = agg(ALLR, 'payout =='), rec = agg(ALLR, 'settled round record'), idle = agg([O12], '24 h rule'), grid = agg(ALLR, 'money on the 1e-8 grid');
  record('MINES-11', full(p) && full(rec) && full(idle) && full(grid), `payout == floor(stake × 99·C(N,k) / (100·C(N−m,k))) on the 1e-8 grid, exact BigInt, 0 on a mine (E01 rules, E02 rulesMinesPayout "rounded down to the smallest unit"): ${fmt(p)} rounds (A ${fmt(agg(['A'], 'payout =='))}, 12 Oct ${fmt(agg([O12], 'payout =='))}); the settled round record (roundId, stake, payout) agrees: ${fmt(rec)}; the round the server finished under the 24 h rule (12 Oct) pays exactly its value at the depth it was left: ${fmt(idle)}; every amount sent and served on the 1e-8 grid (an off-grid value fails, it is never rounded onto the grid): ${fmt(grid)} rounds${[...ALLR].flatMap((k) => R(k).bad).length ? ' — ' + [...ALLR].flatMap((k) => R(k).bad).slice(0, 3).join('; ') : ''}`);
});

// ═══ MINES-12 bet-size invariance (Phase C at 100 × the Phase A stake, and the $10 set) ═══
step(['MINES-12'], () => {
  const chk = (k: string, d: Dataset, stake: string) => {
    const st = d.rounds.filter((r) => { const q = betOf(r); const g = [...r.requests].reverse().find((x) => x.status === 200 && x.response?.game?.active === false)?.response; return units8(q.body.amount) === units8(stake) && units8(g?.game?.stake ?? -1) === units8(stake) && units8(g?.round?.stake ?? -1) === units8(stake); }).length;
    const board = d.rounds.every((r) => betOf(r).body.grid === PHASE_C_BOARD[0] && betOf(r).body.mines === PHASE_C_BOARD[1]);
    const wins = R(k).results.filter((x) => x.won).length;
    return { n: d.rounds.length, clean: R(k).okRounds, st, board, wins, ok: R(k).okRounds === d.rounds.length && st === d.rounds.length && board && wins >= 100 };
  };
  const a = chk('C', pC, PHASE_C_STAKE), b = chk('C $10', pC10, PHASE_C10_STAKE);
  const hundred = units8(PHASE_C_STAKE) === 100n * units8(PHASE_A_STAKE);
  record('MINES-12', a.ok && b.ok && hundred, `Phase C ${a.n} rounds on grid ${PHASE_C_BOARD[0]} with ${PHASE_C_BOARD[1]} mine at ${PHASE_C_STAKE} (= 100 × the Phase A stake ${PHASE_A_STAKE}: ${hundred}): ${pct(a.clean, a.n)} replay clean (field, outcome, multiplier, payout), stake as sent and settled ${pct(a.st, a.n)}, ${a.wins} elevated wins (≥ 100); $10 set ${b.n} rounds at ${PHASE_C10_STAKE}: ${pct(b.clean, b.n)} clean, stake ${pct(b.st, b.n)}, ${b.wins} wins (≥ 100); the derivation takes no stake input`);
});

// ═══ MINES-13 multiplier formula & provenance ═══
step(['MINES-13'], () => {
  const settled = agg(ALLR, 'served multiplier'), rungs = agg(ALLR, 'rung:');
  const spec = SPEC_PAYOUTS.filter((x) => { const [a, d] = multFrac(x.grid, x.mines, x.opened); const [n, q] = x.multiplier.split('/').map(BigInt); return a * q === d * n; }).length;
  record('MINES-13', full(settled) && full(rungs) && spec === SPEC_PAYOUTS.length, `served multiplier == 99·C(N,k) / (100·C(N−m,k)) as the nearest binary64 (E01 "multiplier"; E02 rulesMinesFormula "0.99 × C(N, k) / C(N−m, k)"): every winning settle ${fmt(settled)}, every open rung of a stepped round ${fmt(rungs)} (multiplier and value; A, C, C $10, D, E, 12 Oct); E01's ${SPEC_PAYOUTS.length} worked fractions ${pct(spec, SPEC_PAYOUTS.length)}; computed from (N, m, k) alone — no served odds field is read by the derivation`);
});

// ═══ MINES-14 multiplier monotonicity & bounds (every cell) ═══
step(['MINES-14'], () => {
  let cells = 0, upK = 0, upKn = 0, upM = 0, upMn = 0, above1 = 0;
  for (const N of GRIDS) for (let m = 1; m < N; m++) for (let k = 1; k <= N - m; k++) {
    cells++; const [a, b] = multFrac(N, m, k); if (a > b) above1++;
    if (k < N - m) { upKn++; const [c, d] = multFrac(N, m, k + 1); if (c * b > a * d) upK++; }
    if (m + 1 < N && k <= N - m - 1) { upMn++; const [c, d] = multFrac(N, m + 1, k); if (c * b > a * d) upM++; }
  }
  const cap8 = units8(MAX_WIN); const e3 = readJson('evidence/E03-mines-limits-2026-10-13.json').answer;
  const capSame = units8(e3.wallet.maxWin) === cap8;
  const allRes = ALLR.flatMap((k) => R(k).results); const underCap = allRes.filter((x) => x.payout8 - x.stake8 <= cap8).length;
  const opts = agg(ALLR, 'options.reveal');
  // The max-win branch (E02 rulesMinesMaxWinBehaviour / rulesMinesMaxWinCap) — witnessed only if a served answer offered a
  // max-win stop; every request answer of the replayed rounds is counted
  let answers = 0, maxWinStops = 0;
  for (const [k, d] of [...SCORED, [O12, h24] as [string, Dataset]]) for (const r of d.rounds) { if (k === O12 && (ridRecords.get(r.roundId!) || 0) !== 1) continue;
    for (const q of r.requests) { const g = q.status === 200 ? q.response?.game : null; if (!g || !g.options) continue; answers++; if (g.options.maxWin) maxWinStops++; } }
  const hard = upK === upKn && upM === upMn && above1 === cells && capSame && underCap === allRes.length && full(opts);
  const detail = `exact fractions over all ${cells} (grid, mines, tiles) cells: strictly increasing in tiles ${pct(upK, upKn)}, in mines ${pct(upM, upMn)}, every multiplier > 1 ${pct(above1, cells)}; max win ${MAX_WIN} USDT == E03 wallet maxWin: ${capSame}; every settled win within it ${pct(underCap, allRes.length)}; the next-tile offer follows the max-win rule on every open step ${fmt(opts)}; answers offering a max-win stop: ${maxWinStops} of the ${answers} request answers of the replayed rounds; no max-odds cap is published (the cap is on the win, E02 rulesMinesMaxWinCap)`;
  if (!hard) record('MINES-14', false, detail);
  // The MINES-14 rule (profile): "the multiplier is strictly increasing in depth and in mine count across every (m,k) cell,
  // and every quoted multiplier lies within the declared max-odds cap; a violation is disclosed, not failed". An unexercised
  // max-win branch is not one of its violations, so the check PASSES with the branch declared unwitnessed (DL-10)
  else if (maxWinStops === 0) record('MINES-14', true, `${detail} — the max-win branch (a tile not opened, the round cashed out at its value) is UNWITNESSED: no captured round came near the max win, so the branch is declared, not measured (DL-10); the rule (monotone multipliers within the declared cap) holds, so PASS with the branch declared`);
  else record('MINES-14', true, detail);
});

// ═══ MINES-15 configuration & depth coverage, against the plan in code ═══
step(['MINES-15'], () => {
  const per = new Map<string, number>(); for (const x of R('A').results) per.set(`${x.grid}/${x.mines}`, (per.get(`${x.grid}/${x.mines}`) || 0) + 1);
  const boardsOk = BOARDS.filter(([N, m]) => (per.get(`${N}/${m}`) || 0) === PLAN_ROUNDS_PER_BOARD && PLAN_ROUNDS_PER_BOARD >= PLAN_BOARD_FLOOR).length;
  const counts = BOARDS.map(([N, m]) => per.get(`${N}/${m}`) || 0);
  const first = new Map<number, Set<number>>(); for (const k of ['A', 'E']) for (const x of R(k).results) if (x.firstPick != null) { const s = first.get(x.grid) || new Set(); s.add(x.firstPick); first.set(x.grid, s); }
  const span = GRIDS.map((N) => [N, (first.get(N) || new Set()).size] as const);
  const eDepth = new Set(R('E').results.map((x) => x.k)), eMines = new Set(R('E').results.map((x) => `${x.grid}/${x.mines}`)), eGrids = new Set(R('E').results.map((x) => x.grid));
  const ok = boardsOk === BOARDS.length && span.every(([N, n]) => n === N) && eDepth.size >= 3 && eMines.size >= 3 && eGrids.size === GRIDS.length;
  const detail = `Phase A: ${pct(boardsOk, BOARDS.length)} published (grid, mine count) boards played exactly ${PLAN_ROUNDS_PER_BOARD} times (plan in src/loader.ts; floor ${PLAN_BOARD_FLOOR}; min ${Math.min(...counts)}, max ${Math.max(...counts)}); first-pick tiles over A and E span ${span.map(([N, n]) => `${n}/${N}`).join(', ')} of the grids' tiles; Phase E: ${eGrids.size} grids, ${eMines.size} boards, ${eDepth.size} distinct depths at settle (${[...eDepth].sort((a, b) => a - b).join(', ')})`;
  if (ok) record('MINES-15', true, detail); else captureFlag('MINES-15', detail + ' — the shortfall is in the capture plan, not the operator: disclosed, verdict-neutral');
});

// ═══ MINES-16 wallet / balance reconciliation (the platform's bet history, E04; the account reconciliation, E05) ═══
step(['MINES-16'], () => {
  const e4 = readJson('evidence/E04-mines-bet-history-2026-10-13.json'); const led = new Map<string, any>(e4.rows.map((r: any) => [r.id, r]));
  let n = 0, ok = 0; const bad: string[] = [];
  for (const [k, d] of SCORED) d.rounds.forEach((r, i) => {
    n++; const id = betOf(r).response.game.roundId; const x = led.get(id); const res = R(k).results[i];
    if (x && units8(x.stake) === res.stake8 && units8(x.payout) === res.payout8 && x.game === 'housegames-mines' && x.status === (res.payout8 > 0n ? 'won' : 'lost')) ok++; else if (bad.length < 3) bad.push(`${k} round ${r.idx}: ${JSON.stringify(x)}`);
  });
  // the 24 h round's bet-history row (E07): the server's settlement as the platform's history shows it
  const e7 = readJson('evidence/E07-mines-abandoned-round-2026-10-13.json'); const r24 = h24.rounds.find((x) => x.closedByServer)!;
  const x24 = R(O12).results.find((x) => x.closedByServer)!; const g24 = r24.detail!.response!.game!;
  const row24 = e7.betHistoryRow.id === g24.roundId && units8(e7.betHistoryRow.payout) === x24.payout8 && units8(e7.betHistoryRow.stake) === x24.stake8 && e7.betHistoryRow.status === 'won';
  // E05 is checked by its NUMBERS, not by the shape of a line. Exact decimals (1e-8 units) throughout.
  const e5 = readFileSync(join(ROOT, 'evidence', 'E05-account-reconcile-2026-10-13.txt'), 'utf8');
  const d8 = (t: string): bigint => { const m = /^([+-]?)(\d+)(?:\.(\d{1,8}))?$/.exec(t); if (!m) throw new Error(`E05: not an 8-dp decimal: ${t}`); const v = BigInt(m[2]) * 100000000n + BigInt((m[3] || '').padEnd(8, '0')); return m[1] === '-' ? -v : v; };
  const rowRe = /^(\S+\.json)\s+(\d+)\s+(\S+)\s+(\S+)\s+([+-]\S+)$/gm;
  const e5rows = [...e5.matchAll(rowRe)].map((m) => ({ file: m[1], rounds: Number(m[2]), staked: d8(m[3]), paid: d8(m[4]), net: d8(m[5]) }));
  const tot = /^TOTAL\s+(\d+)\s+(\S+)\s+(\S+)\s+([+-]\S+)$/m.exec(e5);
  const ledL = /^ledger: (\d+) entries = (\d+) captured rounds matched exactly \+ (\d+) open \+ (\d+) from 10 Oct; unexplained (\d+)$/m.exec(e5);
  const after = /^wallet cash balance after \(server, 8 dp\): (\S+)/m.exec(e5);
  const bal = /^balance before = after - net (\S+) \+ open stakes (\S+) = (\S+)$/m.exec(e5);
  const argBefore = /--before (\S+)`/.exec(e5);
  const arith = !!tot && !!ledL && !!after && !!bal && !!argBefore && /\nRECONCILED\n?$/.test(e5)
    && e5rows.every((r) => r.paid - r.staked === r.net)
    && e5rows.reduce((a, r) => a + r.rounds, 0) === Number(tot[1]) && e5rows.reduce((a, r) => a + r.staked, 0n) === d8(tot[2]) && e5rows.reduce((a, r) => a + r.paid, 0n) === d8(tot[3]) && d8(tot[3]) - d8(tot[2]) === d8(tot[4])
    && Number(ledL[1]) === Number(ledL[2]) + Number(ledL[3]) + Number(ledL[4]) && Number(ledL[2]) === Number(tot[1]) && Number(ledL[5]) === 0
    && d8(bal[1]) === d8(tot[4]) && d8(after[1]) - d8(bal[1]) + d8(bal[2]) === d8(bal[3]) && d8(bal[3]) === d8(argBefore[1]);
  // each package file's row (rounds, staked, paid) == what the package computes from the file itself: the 13 Oct phases from the
  // replayed rounds; the 12 Oct file from the server's settled round record of each distinct round (the split round once)
  const settledOf = (d: Dataset) => { const by = new Map<string, [bigint, bigint]>();
    for (const r of d.rounds) { const q = [...r.requests].reverse().find((y) => y.status === 200 && y.response?.round && typeof y.response.round === 'object'); let rr: any = q?.response.round;
      if (!rr && r.closedByServer && r.detail?.response?.game?.active === false) rr = r.detail.response.game; if (rr) by.set(rr.roundId, [units8(rr.stake), units8(rr.payout)]); } return by; };
  const files: [string, string, () => [number, bigint, bigint]][] = [
    ...([['A', PRIMARY_FILE], ['C', PHASE_C_FILE], ['C $10', PHASE_C10_FILE], ['D', PHASE_D_FILE], ['E', PHASE_E_FILE]] as [string, string][]).map(([k, f]) => [k, f, () => { const xs = R(k).results; return [xs.length, xs.reduce((s, x) => s + x.stake8, 0n), xs.reduce((s, x) => s + x.payout8, 0n)]; }] as [string, string, () => [number, bigint, bigint]]),
    [O12, H24_FILE, () => { const v = [...settledOf(h24).values()]; return [v.length, v.reduce((s, x) => s + x[0], 0n), v.reduce((s, x) => s + x[1], 0n)]; }]];
  const fileRows = files.map(([k, f, c]) => { const e = e5rows.find((r) => r.file.endsWith('/' + f.split('/').pop())); const [nr, st, pd] = c(); return { k, nr, ok: !!e && e.rounds === nr && e.staked === st && e.paid === pd }; });
  const sums = fileRows.filter((x) => x.ok).length;
  const minesRows = e5rows.filter((r) => /housebets-mines-/.test(r.file)); const minesE5 = minesRows.reduce((a, r) => a + r.rounds, 0); const minesPkg = fileRows.reduce((a, x) => a + x.nr, 0);
  record('MINES-16', ok === n && e4.rows.length === n && row24 && arith && sums === files.length && minesRows.length === files.length && minesE5 === minesPkg,
    `every scored round of the 13 Oct phases (A, C, C $10, D, E) is in the platform's bet history with the same stake, payout and won/lost status: ${pct(ok, n)} (E04, ${e4.rows.length} rows)${bad.length ? ` — ${bad.join('; ')}` : ''}; the round the server finished under the 24 h rule is in it as won with its payout and stake (E07): ${row24}; E05 checked by its numbers: ${e5rows.length} dataset rows sum to the TOTAL row (${tot?.[1]} rounds, staked and paid exact to 1e-8, each row's net == paid − staked), the ledger line adds up (${ledL?.[1]} entries = ${ledL?.[2]} captured + ${ledL?.[3]} open + ${ledL?.[4]} from 10 Oct, captured == TOTAL, unexplained ${ledL?.[5]}), and balance after ${after?.[1]} − net ${bal?.[1]} + open stakes ${bal?.[2]} == ${bal?.[3]} == the --before input: ${arith}; each of the package's ${files.length} files' row (rounds, staked, paid) == the package's own count and sums from the file: ${pct(sums, files.length)} (12 Oct: ${fileRows.find((x) => x.k === O12)?.nr} distinct rounds from ${h24.rounds.length} records); E05's mines rows: ${minesRows.length}, ${minesE5} rounds == the ${minesPkg} rounds of this package's files: ${minesE5 === minesPkg}; the per-round balance field is not used: the games were captured concurrently, so consecutive mines answers interleave other games' settlements`);
});

// ═══ MINES-17 multi-reveal parity (Phase E, and every stepped round) ═══
step(['MINES-17'], () => {
  const parts = (E: string[]): [string, [number, number]][] => [['rungs', agg(E, 'rung:')], ['safe reveals', agg(E, 'reveal of a derived-safe')], ['mine reveals', agg(E, 'reveal of a derived mine')],
    ['cash-outs', agg(E, 'cashout settles')], ['mine set invariant', agg(E, 'mine set invariant')],
    ['offers on the bet answer', agg(E, 'offer on the bet answer')], ['offers on later answers', agg(E, 'offer on a later answer')]];
  const pE2 = parts(['E']), p12 = parts([O12]).filter(([, x]) => x[1] > 0);
  // The offer shown before every tile (next.multiplier, next.value) is recomputed, not only the reveal/max-win booleans
  const offers = agg(['E', O12], 'offer on');
  // multi-tile auto bets as the SERVER settled them (12 Oct: bets naming 2 or more tiles), not the package's own replay
  const r12 = h24.rounds.filter((r) => (ridRecords.get(r.roundId!) || 0) === 1);
  const multi = R(O12).results.map((x, i) => [x, betOf(r12[i])] as const).filter(([, q]) => Array.isArray(q.body.tiles) && q.body.tiles.length >= 2);
  const multiOk = multi.filter(([x]) => rowOk(x, 'auto (tiles up front)') && x.ok).length;
  const multiSizes = multi.map(([, q]) => q.body.tiles.length);
  const order = agg(['E', O12], 'order independence');
  const ok = pE2.every(([, x]) => full(x)) && p12.every(([, x]) => full(x)) && full(offers) && R('E').okRounds === EXPECTED_PHASE_E_ROUNDS && multi.length > 0 && multiOk === multi.length && full(order);
  record('MINES-17', ok, `Phase E ${pct(R('E').okRounds, EXPECTED_PHASE_E_ROUNDS)} tile-by-tile rounds replay clean: ${pE2.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; 12 Oct tile-by-tile play: ${p12.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; every rung's multiplier and value == the formula at that depth, and every offer shown before a tile (next.multiplier, next.value; cash-out offered iff a tile is open) == the formula at the next depth: ${fmt(offers)} answers; auto bets naming ${Math.min(...multiSizes)} to ${Math.max(...multiSizes)} tiles as the SERVER settled them (12 Oct): ${pct(multiOk, multi.length)} replay from the derived field (the scored 13 Oct auto bets name one tile each); order independence ${fmt(order)} is COMPUTED by the package (the tile-by-tile walk replayed as if named up front), not a server answer; the field is derived before any tile is chosen (the derivation takes no tile input)`);
});

// ═══ MINES-18 anti-circularity: survival probability from combinatorics alone, and a negative control ═══
step(['MINES-18'], () => {
  let cells = 0, same = 0;
  for (const N of GRIDS) for (let m = 1; m < N; m++) for (let k = 1; k <= N - m; k++) { cells++; const [a, b] = survivalComb(N, m, k), [c, d] = survivalProduct(N, m, k); if (a * d === b * c) same++; }
  // negative control: a served field with one mine moved to a safe tile must be rejected by the replay
  const r0 = JSON.parse(JSON.stringify(ds.rounds[0])); const g = betOf(r0).response.game; const safe = [...Array(g.grid).keys()].find((t) => !g.field.includes(t))!;
  for (const q of r0.requests) if (q.response?.game?.field) q.response.game.field = [safe, ...q.response.game.field.slice(1)];
  const neg = replayRound(r0, epochIndex(ds)); const rejected = !rowOk(neg, 'field (mine slots');
  const wins = R('A').results.filter((x) => x.won).length; const exp = R('A').results.reduce((s, x) => s + (x.grid - x.mines) / x.grid, 0);
  record('MINES-18', same === cells && rejected, `P(k tiles safe) = C(N−m,k)/C(N,k) equals the product Π(N−m−i)/(N−i) in exact integers for ${pct(same, cells)} cells; negative control: round 0 with one served mine moved to a safe tile is rejected by the replay: ${rejected}; no operator win-chance field exists or is read; Phase A wins ${wins} vs ${exp.toFixed(1)} expected from the combinatorics (MINES-22 tests it)`);
});

// ═══ MINES-19 effective edge per cell vs the claim (RTP-CLAIM 1.2.0 table, exact; enforced) ═══
const rtp = input('rtp', () => (computeRtpClaim()));
const gate = input('gate', () => (runRtpClaimGate()));
step(['MINES-19'], () => {
  const uniform = rtp.trueMin.rtpExact === rtp.trueMax.rtpExact;
  // The -19 status comes from the RTP-CLAIM rule alone (recordRtpClaim: table mismatch → FAIL, a house-side miss →
  // OVERSTATED); no hand-written comparison with a figure sits in front of it
  const ok = true; const pub = PUB!;
  const stake8 = units8(PHASE_A_STAKE); let worst = 0, worstCell = '';
  for (const N of GRIDS) for (let m = 1; m < N; m++) for (let k = 1; k <= N - m; k++) {
    const [a, b] = multFrac(N, m, k), [c, d] = survivalComb(N, m, k); const lost = Number(((stake8 * a) % b) * 1_000_000n / b) / 1e6;
    const cost = lost * fracToDouble(c, d) / Number(stake8); if (cost > worst) { worst = cost; worstCell = `${N}/${m}/${k}`; }
  }
  recordRtpClaim('MINES-19', ok, gate, `${rtp.settings} cells (every grid, mine count and cash-out depth): derived RTP ${rtp.trueMin.rtpExact} … ${rtp.trueMax.rtpExact} (the same in every cell: ${uniform}) — vs the flat claim ${pub.rtp} read from the exhibits at run time: ${pub.places.map((p) => `${p.where} "${p.text.split(':')[0]}" (${p.rtp})`).join('; ')}; held to the highest${pub.agree ? ', the places agree' : ' — THE PLACES DISAGREE'}; E02 rulesMinesRTP is the template "The return is exactly {pct}% at every cash-out point…" (10 Oct; reworded 16 Oct, E08), whose {pct} the page fills at run time, not captured rendered — P-2; ${rtp.houseSideFailures} house-side beyond the 0.1 pp band → RTP-CLAIM ${rtp.outcome} (rule ${rtp.rule} ${rtp.ruleVersion.split(' ')[0]}, enforced ${RTP_CLAIM_RULE_ENFORCED}: ${gate.status}); the payout's truncation to 1e-8 at the ${PHASE_A_STAKE} stake costs at most ${worst.toExponential(2)} of RTP (cell ${worstCell}, disclosed); committed table matches: ${gate.tableMatches}`);
});

// ═══ MINES-20 / MINES-21 the simulation, re-run in full and compared with the pinned census ═══
/** '' when the pinned census ships; else the words the census checks print (and censusSame is false: FAIL). */
function censusMissing(): string { return existsSync(join(ROOT, 'outputs', 'simulation-results.json')) ? '' : ' (outputs/simulation-results.json is MISSING: the re-run has nothing to equal, FAIL)'; }
let cen: Census; let censusSame = false;
step(['MINES-20'], () => {
  cen = census([...SCORED, [O12, h24]]);   // Pass 2 replays every revealed seed of every dataset (labels as src/loader.ts ALL_DATASETS)
  const committed = (existsSync(join(ROOT, 'outputs', 'simulation-results.json')) ? readFileSync(join(ROOT, 'outputs', 'simulation-results.json'), 'utf8') : null);
  censusSame = censusText(cen) === committed;
  mkdirSync(join(ROOT, 'outputs', 'run'), { recursive: true });
  writeFileSync(join(ROOT, 'outputs', 'run', 'simulation-results.json'), censusText(cen));
});
step(['MINES-20'], () => {
  // (a) position uniformity: per grid, each step's position among the tiles left, and each step's tile over all N tiles
  const ps: number[] = []; let sumsOk = true;
  for (const g of cen.pass1) {
    const N = g.grid;
    for (let i = 0; i < N - 1; i++) {
      const n = g.stepRounds[i]; if (n !== g.rounds * (N - 1 - i)) sumsOk = false;   // the rounds of the boards with more than i mines
      const row = g.stepIndex[i]; const e = n / row.length; if (row.reduce((s, v) => s + v, 0) !== n) sumsOk = false;
      ps.push(chiSquaredPValue(row.reduce((s, o) => s + (o - e) ** 2 / e, 0), row.length - 1));
      const col = g.tileAtStep.map((t) => t[i]); const e2 = n / N; if (col.reduce((s, v) => s + v, 0) !== n) sumsOk = false;
      ps.push(chiSquaredPValue(col.reduce((s, o) => s + (o - e2) ** 2 / e2, 0), N - 1));
    }
  }
  const uMin = Math.min(...ps), uTests = ps.length, uOk = uMin >= ALPHA_SCREEN / uTests;
  // (b) serial on pick 0: lag-1 and runs above/below the middle, per grid
  const ser = cen.pass1.map((g) => {
    const f = g.firstPick, n = f.n, sx = Number(BigInt(f.sumX)), sx2 = Number(BigInt(f.sumX2)), sxy = Number(BigInt(f.sumXY));
    const mean = sx / n, v = sx2 / n - mean * mean, r1 = (sxy / (n - 1) - mean * mean) / v, z = r1 * Math.sqrt(n);
    const runs = runsStatisticFromCounts(f.runs, f.upper, n);
    return { N: g.grid, z, pLag: twoSidedNormalP(z), zr: runs.z, pRuns: twoSidedNormalP(runs.z) };
  });
  const lagOk = ser.every((s) => s.pLag >= ALPHA_SCREEN / ser.length), runsOk = ser.every((s) => s.pRuns >= ALPHA_SCREEN / ser.length);
  // (c) RTP convergence per (grid, mines, k): rounds whose smallest mine is ≥ k survive tiles 0 … k − 1
  let scored = 0, scoredOk = 0, unscored = 0, unscoredIn = 0, worstZ = 0, worstCell = '', faSum = 0, faAll = 0, mineSumsOk = true;
  let bandMin = Infinity, bandMax = 0, bandMinCell = '', bandMaxCell = '', wideBands = 0; const outUnscored: string[] = [];
  let rtpEMin = Infinity, rtpEMax = -Infinity;   // each cell's band is centred on its exact derived RTP, never on the claim
  for (const g of cen.pass1) {
    const N = g.grid, n = g.rounds;
    for (let m = 1; m < N; m++) {
      const mm = g.minMine[m - 1]; if (mm.reduce((s, v) => s + v, 0) !== n || mm.length !== N - m + 1) mineSumsOk = false;
      let surv = n;   // Σ_{K ≥ k} mm[K], from k = 1 upward
      for (let k = 1; k <= N - m; k++) {
        surv -= mm[k - 1];
        const [c, d] = survivalComb(N, m, k); const p = fracToDouble(c, d); const mult = multDouble(N, m, k);
        const [ma, mb] = multFrac(N, m, k); const rtpE = fracToDouble(ma * c, mb * d); if (rtpE < rtpEMin) rtpEMin = rtpE; if (rtpE > rtpEMax) rtpEMax = rtpE;
        const rtpS = (surv / n) * mult, se = Math.sqrt(p * (1 - p)) * mult / Math.sqrt(n), inBand = Math.abs(rtpS - rtpE) <= EDGE_SIGMAS * se + EDGE_BUFFER;
        const fa = edgeBandFalseAlarm(n, p, mult, rtpE).rate; faAll += fa;
        if (n * p >= EDGE_MIN_EXPECTED) {
          scored++; if (inBand) scoredOk++; faSum += fa;
          const zc = Math.abs(rtpS - rtpE) / se; if (zc > worstZ) { worstZ = zc; worstCell = `${N}/${m}/${k}`; }
          const half = EDGE_SIGMAS * se + EDGE_BUFFER; if (half < bandMin) { bandMin = half; bandMinCell = `${N}/${m}/${k}`; } if (half > bandMax) { bandMax = half; bandMaxCell = `${N}/${m}/${k}`; }
          if (half > 1 - rtpE) wideBands++;
        } else { unscored++; if (inBand) unscoredIn++; else outUnscored.push(`${N}/${m}/${k} expected ${(n * p).toFixed(3)} survivors, observed ${surv}`); }
      }
    }
  }
  const boards = GRIDS.reduce((a, N) => a + N - 1, 0), labels = new Set(GRIDS.flatMap((N) => Array.from({ length: N - 1 }, (_, k) => pass1Seed(N, k + 1, 0)).flatMap((x) => [x.server, x.client])));
  const ownSeeds = labels.size === 2 * boards;   // no two boards on one seed label
  const depth = cen.pass1.length === GRIDS.length && ownSeeds && cen.pass1.every((g, i) => g.grid === GRIDS[i] && g.rounds === SIM_ROUNDS_PER_BOARD && g.rounds >= FLOOR_ROUNDS_PER_BOARD && g.minMine.length === g.grid - 1 && g.stepRounds.length === g.grid - 1 && g.firstPick.n === g.rounds * (g.grid - 1));
  const faOk = faSum <= ALPHA_SCREEN;
  const ok = censusSame && sumsOk && mineSumsOk && uOk && lagOk && runsOk && scoredOk === scored && depth && faOk;
  record('MINES-20', ok, `census re-run in full == the pinned outputs/simulation-results.json byte for byte: ${censusSame}${censusMissing()}; ${boards} boards (every mine count of the ${GRIDS.length} grids) × ${SIM_ROUNDS_PER_BOARD.toLocaleString('en')} rounds = ${(boards * SIM_ROUNDS_PER_BOARD).toLocaleString('en')} rounds on auditor-chosen seeds independent of the operator (fixed labels, src/sim-config.ts, so the census reproduces byte for byte), every board on its own seeds: ${ownSeeds}, drawn to its m picks (floor ${FLOOR_ROUNDS_PER_BOARD.toLocaleString('en')} per board: ${depth}); position uniformity: ${uTests} chi² tests (per grid, each step's position among the tiles left, and its tile over all N, on the rounds of every board of the grid that draws that step), smallest p ${uMin.toExponential(3)} ≥ α/4/${uTests} = ${(ALPHA_SCREEN / uTests).toExponential(3)}: ${uOk}; serial on pick 0 of every round of a grid (${cen.pass1.map((g) => `${g.grid}: ${g.firstPick.n.toLocaleString('en')}`).join(', ')}): lag-1 z ${ser.map((s) => `${s.N}: ${s.z.toFixed(2)}`).join(', ')}, runs z ${ser.map((s) => `${s.N}: ${s.zr.toFixed(2)}`).join(', ')} (each p ≥ α/4/4: lag ${lagOk}, runs ${runsOk}); RTP convergence: ${pct(scoredOk, scored)} scored cells (expected survivors ≥ ${EDGE_MIN_EXPECTED}) within ${EDGE_SIGMAS}·SE + ${EDGE_BUFFER} of the cell's exact derived RTP (${rtpEMin} … ${rtpEMax}; never the published figure), worst |Δ|/SE ${worstZ.toFixed(2)} (cell ${worstCell}); ${unscored} deeper cells printed, not scored (${unscoredIn} in band; outside: ${outUnscored.join('; ') || 'none'}; their exact false-alarm rates summed over all ${scored + unscored} cells ${faAll.toFixed(2)}); band: |RTP_sim − RTP_exact(cell)| ≤ ${EDGE_SIGMAS}·SE + ${EDGE_BUFFER}, SE = σ/√n per cell, half-width over the scored cells ${bandMin.toExponential(3)} (cell ${bandMinCell}) … ${bandMax.toExponential(3)} (cell ${bandMaxCell}); ${wideBands} of ${scored} scored cells have a half-width wider than the cell's house edge 1 − RTP_exact(cell), so in those cells the band cannot detect an edge of that size; false-alarm: uniformity ≤ α/4 = ${ALPHA_SCREEN} (Bonferroni), lag-1 and runs ≤ α/4 each, RTP cells ${fmtRate(faSum)} (exact binomial, summed) ≤ α/4: ${faOk}`);
});
step(['MINES-21'], () => {
  const ep = cen.pass2.epochs; const D = Number(PASS2_D); const epA = ep.filter((e) => e.set === 'A');
  // the pooled return of the Phase A epochs (the statistic scored until 14 Oct 2026, on Phase A only; printed, not scored)
  const agg2 = (w: 'early' | 'ref') => { let R2 = 0n, M = 0n, V = 0n, n = 0; for (const e of epA) { R2 += BigInt(e[w].ret12!); M += BigInt(e[w].meanD!); V += BigInt(e[w].varD2!); n += e[w].rounds; }
    const sd = Math.sqrt(Number(V)) / D; const z = (Number(R2) - Number(M) / D) / sd; return { z, p: normalLowerTailP(z), n, sd12: sd }; };
  const early = agg2('early'), ref = agg2('ref');
  // the SCORED statistic, over every played slot of every revealed seed: each slot's return minus its exact mean, ÷ its exact
  // sd, summed and ÷ √slots; the multiplier cancels, so each term is (win − p)/√(p(1 − p)), p = C(N − m, K)/C(N, K)
  const pOf = (k: string) => { const [N, m, K] = k.split('/').map(Number); const [c, d] = survivalComb(N, m, K); return fracToDouble(c, d); };
  const std = (es: Census['pass2']['epochs'], w: 'early' | 'ref') => { let sum = 0, n = 0, byOk = true;
    for (const e of es) { let r = 0, wn = 0; for (const [k, [rounds, wins]] of Object.entries(e[w].byCell)) { const p = pOf(k); sum += (wins - rounds * p) / Math.sqrt(p * (1 - p)); n += rounds; r += rounds; wn += wins; }
      if (r !== e[w].rounds || wn !== e[w].wins) byOk = false; }
    const z = sum / Math.sqrt(n); return { z, p: normalLowerTailP(z), n, byOk }; };
  const sEarly = std(ep, 'early'), sRef = std(ep, 'ref');
  const perSet = ALL_DATASETS.map(([k]) => ({ k, seeds: ep.filter((e) => e.set === k).length, ...std(ep.filter((e) => e.set === k), 'early') }));
  const below = epA.filter((e) => BigInt(e.early.ret12!) * PASS2_D < BigInt(e.early.meanD!)).length;
  // the early window is the capture itself: every revealed seed with captured rounds has an epoch; its captured rounds are
  // nonces 1 … n with no gap; its early window is exactly those n nonces and its wins per cell == the SERVED outcomes
  const sets: [string, Dataset][] = [...SCORED, [O12, h24]];
  const byKey = new Map(ep.map((e) => [`${e.set}|${e.seedHash}`, e])); const allSlots: Slot[] = [];
  let revealed = 0, withRounds = 0, windowOk = 0, contiguous = 0; const missing: string[] = [];
  for (const [k, d] of sets) { const slots = playedSlots(d);
    for (const s of d.seeds) { revealed++; const pl = slots.get(s.hashedServerSeed); if (!pl?.length) continue; withRounds++; allSlots.push(...pl);
      if (pl.every((x, i) => x.nonce === i + 1)) contiguous++;
      const e = byKey.get(`${k}|${s.hashedServerSeed}`); if (!e) { missing.push(`${k} epoch ${s.epoch}`); continue; }
      const cap = new Map<string, [number, number]>(); for (const x of pl) { const c = cap.get(`${x.N}/${x.m}/${x.K}`) || [0, 0]; c[0]++; if (x.won) c[1]++; cap.set(`${x.N}/${x.m}/${x.K}`, c); }
      if (e.early.rounds === pl.length && e.early.rounds + e.ref.rounds === SIM_PASS2_NONCES && cap.size === Object.keys(e.early.byCell).length
        && [...cap].every(([c, [r, w]]) => e.early.byCell[c]?.[0] === r && e.early.byCell[c]?.[1] === w)) windowOk++; } }
  // Phase A: the early window's wins and pooled return equal the captured rounds' (replayed in MINES-07)
  let capWins = 0, capRet = 0n; for (const x of R('A').results) if (x.won) { capWins++; capRet += mult12(x.grid, x.mines); }
  const earlyWins = epA.reduce((s, e) => s + e.early.wins, 0), earlyRet = epA.reduce((s, e) => s + BigInt(e.early.ret12!), 0n);
  const zPow = -normalQuantile(SIM_PASS2_ALPHA) + normalQuantile(0.8);
  // power of the scored statistic: a uniform per-round RTP deficit d (fraction of the stake) moves every slot's standardised term
  // by d/σ_i (σ_i the slot's return sd per unit stake), so z moves by d·Σ(1/σ_i)/√slots; 80 % power at α needs zPow
  const pS = (s: Slot) => { const [c, d] = survivalComb(s.N, s.m, s.K); return fracToDouble(c, d); };
  const sigma = (s: Slot) => { const p = pS(s); return multDouble(s.N, s.m, s.K) * Math.sqrt(p * (1 - p)); };
  const stdPower = (xs: Slot[]) => { let inv = 0; for (const x of xs) inv += 1 / sigma(x); return zPow * Math.sqrt(xs.length) / inv * 100; };
  const ext = allSlots.filter((s) => multDouble(s.N, s.m, s.K) >= 10);
  const powAll = stdPower(allSlots), powExt = stdPower(ext);   // powExt: a test computed on the ext slots ALONE (not scored)
  // the SCORED statistic runs over all slots: a deficit d confined to the ext slots moves its z by d·Σ_ext(1/σ_i)/√(all slots)
  const powExtScored = (() => { let inv = 0; for (const x of ext) inv += 1 / sigma(x); return zPow * Math.sqrt(allSlots.length) / inv * 100; })();
  let eStd = 0; for (const x of ext) { const p = pS(x); eStd += ((x.won ? 1 : 0) - p) / Math.sqrt(p * (1 - p)); } const extZ = eStd / Math.sqrt(ext.length);
  const deficitPooled = (zPow * early.sd12 / 1e12) / early.n * 100;
  const depthOk = SIM_PASS2_NONCES >= FLOOR_PASS2_NONCES && epA.length === EXPECTED_SEEDS && epA.every((e) => e.early.rounds === EXPECTED_EPOCH_SIZE);
  const faOk = PASS2_FALSE_ALARM.rate <= FAIL_FALSE_ALARM_CAP && PASS2_FALSE_ALARM.statistic === SIM_PASS2_STATISTIC && PASS2_FALSE_ALARM.slots === sEarly.n;
  const ok = censusSame && depthOk && sEarly.byOk && sRef.byOk && ep.length === withRounds && missing.length === 0 && contiguous === withRounds && windowOk === withRounds
    && allSlots.length === sEarly.n && capWins === earlyWins && capRet === earlyRet && sEarly.p >= SIM_PASS2_ALPHA && faOk;
  record('MINES-21', ok, `${censusMissing() ? `census${censusMissing()}; ` : ''}${ep.length} revealed seeds × ${SIM_PASS2_NONCES.toLocaleString('en')} nonces: every revealed seed of every dataset (${perSet.map((x) => `${x.k} ${x.seeds}`).join(', ')}; ${withRounds} of the ${revealed} revealed seeds carry captured rounds); early window = the nonces the capture played on the seed (1..${EXPECTED_EPOCH_SIZE} on a 13 Oct pair, 1..n with n ≤ 10 on a 12 Oct pair), reference = the rest of 1..${SIM_PASS2_NONCES.toLocaleString('en')}; each nonce replays a round the capture played on that seed (its board, its tiles in order, its depth); scored statistic (${SIM_PASS2_STATISTIC}, src/sim-config.ts; switched from the pooled return on 14 Oct, after the pooled result below was known — both printed): each played slot's return minus its exact mean ÷ its exact sd, summed and ÷ √slots, over the ${sEarly.n} early-window slots: z ${sEarly.z.toFixed(3)}, one-sided p ${sEarly.p.toFixed(4)} (≥ ${SIM_PASS2_ALPHA}: ${sEarly.p >= SIM_PASS2_ALPHA}); reference window z ${sRef.z.toFixed(3)}; per dataset, printed, not scored: ${perSet.map((x) => `${x.k} z ${x.z.toFixed(3)} (${x.n} slots)`).join(', ')}; per-cell census counts sum to the window totals: ${sEarly.byOk && sRef.byOk}; every seed's captured rounds are nonces 1..n with no gap: ${pct(contiguous, withRounds)}; early window == the served outcomes, cell by cell: ${pct(windowOk, withRounds)} seeds${missing.length ? ` (no epoch for ${missing.join(', ')})` : ''}; the pooled return of the Phase A epochs (scored until 14 Oct, printed): early z ${early.z.toFixed(3)}, p ${early.p.toFixed(4)}, reference z ${ref.z.toFixed(3)}; ${below} Phase A epochs below expectation, ${epA.length - below} at or above; Phase A early window == the captured rounds (wins ${pct(earlyWins, capWins)}, return exact: ${capRet === earlyRet}); detection power of the scored statistic at 80 %: a ${powAll.toFixed(2)} pp per-round RTP deficit spread over all ${allSlots.length} slots; a deficit confined to the ${ext.length} slots whose multiplier at their depth is ≥ 10× would have to be ${powExtScored.toFixed(1)} pp per round on those slots${powExtScored > 99 ? ', more than the 99 pp a round can lose, so the scored statistic does not detect it' : ''}; a separate test on those ${ext.length} slots alone would detect ${powExt.toFixed(1)} pp (their own standardised z ${extZ.toFixed(3)}; printed, not scored); the Phase A pooled return's power ${deficitPooled.toFixed(2)} pp; false-alarm rate of the scored rule ${PASS2_FALSE_ALARM.rate} ± ${PASS2_FALSE_ALARM.standardError} over the ${PASS2_FALSE_ALARM.slots} played slots (== this run's ${sEarly.n}: ${PASS2_FALSE_ALARM.slots === sEarly.n}), of the Phase A pooled rule ${PASS2_FALSE_ALARM_POOLED.rate} ± ${PASS2_FALSE_ALARM_POOLED.standardError} (src/false-alarm-pass2.ts, npm run false-alarm:pass2; cap ${FAIL_FALSE_ALARM_CAP})`);
});

// ═══ MINES-22 live-sample fit (INFORMATIONAL) ═══
step(['MINES-22'], () => {
  const parts = GRIDS.map((N) => {
    const f = R('A').results.filter((x) => x.grid === N && x.tile0 !== null); const c = new Array(N).fill(0); for (const x of f) c[x.tile0!]++;
    const e = f.length / N; const chi2 = c.reduce((s, o) => s + (o - e) ** 2 / e, 0); return `${N}: chi² ${chi2.toFixed(1)} (df ${N - 1}) p ${chiSquaredPValue(chi2, N - 1).toFixed(3)}`;
  });
  const res = R('A').results; const w = res.filter((x) => x.won).length; let mu = 0, v = 0; for (const x of res) { const p = (x.grid - x.mines) / x.grid; mu += p; v += p * (1 - p); }
  const z = (w - mu) / Math.sqrt(v);
  record('MINES-22', true, `Phase A first mine (field[0]) per grid — ${parts.join('; ')}; wins ${w} vs ${mu.toFixed(1)} expected, z ${z.toFixed(3)} p ${twoSidedNormalP(z).toFixed(4)} — informational (${res.length} rounds have little power and never bear the verdict)`);
});

// ═══ OBSERVATIONS — facts with no MINES profile check; recorded, never scored ═══
step(['MINES-23'], () => {
  const r = h24.rounds.find((x) => x.closedByServer)!; const x = replayRound(r, epochIndex(h24));
  const e7 = readJson('evidence/E07-mines-abandoned-round-2026-10-13.json'); const idleText = readJson('evidence/E02-mines-rules-panel-2026-10-10.json').rulesPanelEnglish.rulesMinesIdle;
  const g = r.detail!.response!.game!; const lastDecision = [...r.requests].filter((q) => q.status === 200).pop()!.at!;
  const hrs = (Date.parse(g.settledAt!) - Date.parse(lastDecision)) / 3.6e6;
  const hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60), ss = Math.round(((hrs - hh) * 60 - mm) * 60);
  const led = e7.betHistoryRow; const ledOk = led.id === g.roundId && units8(led.payout) === x.payout8 && led.status === 'won';
  const checks = (h24.meta.openChecks || []).map((c: any) => `${c.hoursSinceLeft} h ${c.stillActive ? 'active' : 'closed'}`).join(', ');
  observations.push(`24 h rule (E02 rulesMinesIdle: "${idleText}"): the round left open on purpose on 12 Oct (grid ${g.grid}, ${g.mines} mine, ${x.leftK} tile open, value ${Number(x.leftValue8) / 1e8}) was finished by the server at ${g.settledAt}, ${hh} h ${mm} m ${ss} s after the last decision (${lastDecision}); capture checks: ${checks}; settled as a cash-out at exactly its value ${Number(x.payout8) / 1e8}: ${x.ok}; bet history row won, payout equal: ${ledOk} (E07). The witnessed branch ("with tiles open it is cashed out at its value") settled by the rule — its payout is SCORED in MINES-11 and its bet-history row in MINES-16, so a settlement that broke the rule moves the verdict; the branch "with none, the first tile is opened and, if safe, cashed out" was not exercised by the capture: declared unwitnessed (DL-7); the close came ${hh - 24} h ${mm} m ${ss} s after the 24 hours, reported as observed (no bound is set on it). The MINES profile has no check for the 24 h rule itself, so its timing and the unwitnessed branch are an observation, not scored (ROAD-31 / HILO-32 score the same rule: PASS with the unwitnessed branch declared)`);
  const negs = h24.rounds.filter((q) => q.spec?.kind === 'negative');
  const refused = negs.filter((q) => q.requests.some((y) => y.path === '/mines2/action' && y.body.action === 'cashout' && y.status === 400 && y.response?.code === 6)).length;
  observations.push(`cash-out with no tile open (E02 rulesMinesCashout "Cash out is not offered with no tile open"), sent on purpose in the 12 Oct capture: refused ${pct(refused, negs.length)} (HTTP 400, code 6 "open a tile before cashing out"); the rest of each of those rounds is recomputed in MINES-07/10/11`);
  // the 12 Oct round split over two records (DL-9): the requests the capture re-sent with the bet's own generation id, and
  // the second bet it sent while that round was still open
  const rid = [...ridRecords].find(([, n]) => n > 1)?.[0]; const recs = h24.rounds.filter((q) => q.roundId === rid);
  const bet0 = recs[0]?.requests.find((q) => q.path === '/mines2/bet' && q.status === 200);
  const resent = recs[0]?.requests.filter((q) => q.body?.generation === bet0?.body.generation) ?? [];
  const acts = resent.filter((q) => q.path === '/mines2/action'), echoed = acts.filter((q) => q.status === 200 && JSON.stringify(q.response) === JSON.stringify(bet0?.response)).length;
  const rebet = recs[1]?.requests.find((q) => q.path === '/mines2/bet');
  observations.push(`the 12 Oct round ${String(rid).slice(0, 8)}… (split over ${recs.length} records, DL-9): ${resent.length} requests carried the bet's own generation id (the bet and ${acts.length} actions); ${pct(echoed, acts.length)} of those actions were answered with the bet answer itself (nothing opened, no second round); a second bet sent while that round was open was refused, HTTP ${rebet?.status} code ${rebet?.response?.code} "${rebet?.response?.error}"; the round was then finished by one reveal and is counted in MINES-16`);
});

// ═══ Package checks: MINES-23, 24, 25, 27, 28, 29, 30 ═══
const manifest = input('manifest', () => (existsSync(join(ROOT, 'MANIFEST.md')) ? readFileSync(join(ROOT, 'MANIFEST.md'), 'utf8') : ''));
const readme = input('readme', () => (existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : ''));
// The framework's standardized fairness-integrity matrix: the eight rows S5-1 … S5-8 by id AND name, in the methodology's
// order (the PLINKO profile, whose -23 check this one shares, names them). Where the vendored profile names them too, its
// list must be this one. A row renamed, reordered, added or dropped is a GAP, not only a missing status.
const S5_FRAMEWORK_ROWS = input('S5_FRAMEWORK_ROWS', () => (['Replay protection', 'Input validation', 'Seed integrity under adversarial input', 'Cross-player isolation',
  'Payout field integrity', 'Nonce sequence enforcement', 'Parameter boundary enforcement', 'Game-specific state']));
step(['MINES-23'], () => {
  const blk = /<!-- S5-MATRIX:BEGIN -->\n([\s\S]*?)\n<!-- S5-MATRIX:END -->/.exec(manifest);
  const cells = (blk ? blk[1].split('\n').filter((l) => /^\| S5-/.test(l)) : []).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const rowsOk = cells.length === S5_FRAMEWORK_ROWS.length && S5_FRAMEWORK_ROWS.every((n, i) => cells[i][0] === `S5-${i + 1}` && cells[i][1] === n);
  const results = cells.map((c) => (/^(Pass|Flag|Hard Fail|Not tested)\b/.exec(c[3] ?? '') || [])[1] ?? null);
  const statusOk = cells.length > 0 && results.every((r) => r !== null), tiedOk = cells.every((c) => (c[4] ?? '').length > 0);
  const asserts = String((readJson('profile/profile.json').checks || []).find((c: any) => c.id === 'MINES-23')?.asserts ?? '');
  const named = /S5-1 … S5-8 \(([^)]*)\)/.exec(asserts); const profNames = named ? named[1].split(', ') : null;
  const profOk = !profNames || JSON.stringify(profNames) === JSON.stringify(S5_FRAMEWORK_ROWS.map((x) => x.toLowerCase()));
  // the printed tally separates a row that passes on every control it names from one that passes on part of them and from
  // one that is Not tested (a status that starts "Pass on" is a partial pass)
  const s5cov = (st: string[]) => { const full = st.filter((s) => /^Pass\b/.test(s) && !/^Pass on\b/.test(s)).length, part = st.filter((s) => /^Pass on\b/.test(s)).length, nt = st.filter((s) => /^Not tested\b/.test(s)).length, fl = st.filter((s) => /^Flag\b/.test(s)).length, hf = st.filter((s) => /^Hard Fail\b/.test(s)).length;
    return `${full} Pass on every control the row names, ${part} Pass on part of the controls it names, ${nt} Not tested${fl ? `, ${fl} Flag` : ''}${hf ? `, ${hf} Hard Fail` : ''}`; };
  const off = cells.map((c, i) => `${c[0]} ${c[1]}`).filter((x, i) => x !== `S5-${i + 1} ${S5_FRAMEWORK_ROWS[i]}`);
  record('MINES-23', !!blk && rowsOk && statusOk && tiedOk && profOk, `MANIFEST.md S5-MATRIX block: ${blk ? cells.length : 'no'} rows; ids and names == the framework's eight, in order (${S5_FRAMEWORK_ROWS.map((n, i) => `S5-${i + 1} ${n}`).join(', ')}): ${rowsOk}${off.length ? ` (differ: ${off.join('; ')})` : ''}; each result Pass / Flag / Hard Fail / Not tested: ${statusOk} (${s5cov(cells.map((c) => c[3] ?? ''))}); each tied to a check, capture or limitation: ${tiedOk}; the vendored profile ${profNames ? `names the rows: ${profOk}` : 'states the ids only (the shared PLINKO-23 text names the rows)'}`);
});
// -24: the site-verifier module (site-verifier/derive.js, generated from src/rng.ts by scripts/build-site-verifier.mjs).
// Two legs, both needed. The pins: the file on disk has the sha256 of SITE_VERIFIER_PIN (src/artifact-pins.ts) and of its
// RELEASE-MANIFEST.json entry, and MANIFEST.md and README.md quote that sha256. The replay: the module is loaded from that
// file (never bundled into verify.js), must export what src/rng.ts exports, and every function is run side by side with
// src/rng.ts on every round MINES-07 replays (the rounds of the five 13 Oct datasets and the 12 Oct rounds settled in their
// own record), with the inputs that replay uses: the epoch's revealed seed and client seed, the round's nonce, its grid
// size and mine count. One differing result fails the check. The pins alone would pass a module that derives something
// else and was re-pinned; the replay alone would pass a file nobody pinned.
const SITE = await loadSiteModule(ROOT, SITE_VERIFIER_PIN[0]);
step(['MINES-24'], () => {
  const [file, pin] = SITE_VERIFIER_PIN;
  const relPin: string | null = (() => { try { return readJson('RELEASE-MANIFEST.json').files?.[file] ?? null; } catch { return null; } })();
  const pinOk = SITE.sha256 !== null && SITE.sha256 === pin, relOk = SITE.sha256 !== null && SITE.sha256 === relPin;
  const cited = SITE.sha256 !== null && manifest.includes(SITE.sha256) && readme.includes(SITE.sha256);
  const names = exportNames(RNG), exportsOk = !!SITE.mod && JSON.stringify(exportNames(SITE.mod)) === JSON.stringify(names);
  const sets: [string, Dataset][] = [...SCORED, [O12, h24]];
  function* probes(): Generator<Probe> {
    for (const [k, d] of sets) {
      for (const s of d.seeds) if (s.revealedServerSeed) yield ['sha256Hex', (m) => m.sha256Hex(s.revealedServerSeed)];
      const byHash = epochIndex(d);
      for (const x of R(k).results) {
        const ep = x.epochHash ? byHash.get(x.epochHash) : undefined; if (!ep || !ep.seed.revealedServerSeed || !x.field) continue;
        const server = ep.seed.revealedServerSeed, client = ep.seed.clientSeed, nonce = x.nonce, grid = x.grid, mines = x.mines;
        yield ['hmacBlock', (m) => m.hmacBlock(server, client, nonce, 0)];
        yield ['drawStream', (m) => { const it = m.drawStream(server, client, nonce); return Array.from({ length: 32 }, () => it.next().value); }];
        const u = RNG.hmacBlock(server, client, nonce, 0).readUInt32BE(0);
        yield ['positionFromU', (m) => m.positionFromU(u, grid)];
        yield ['picks', (m) => m.picks(server, client, nonce, grid, mines)];
      }
    }
  }
  const rounds = sets.reduce((n, [k]) => n + R(k).results.length, 0), scored = SCORED.reduce((n, [k]) => n + R(k).results.length, 0);
  const rp24 = exportsOk ? replaySide(RNG, SITE.mod!, probes()) : null;
  const covered = rp24 ? names.filter((n) => rp24.byLabel[n] > 0).length : 0;
  const replayOk = !!rp24 && rp24.differences === 0 && rp24.byLabel.picks === rounds
    && scored === EXPECTED_ROUNDS + EXPECTED_PHASE_C_ROUNDS + EXPECTED_PHASE_C10_ROUNDS + EXPECTED_PHASE_D_ROUNDS + EXPECTED_PHASE_E_ROUNDS && covered === names.length;
  record('MINES-24', pinOk && relOk && cited && exportsOk && replayOk, `${file} (generated from src/rng.ts by scripts/build-site-verifier.mjs): ${SITE.sha256 === null ? 'missing' : `sha256 ${SITE.sha256}`}; == SITE_VERIFIER_PIN in src/artifact-pins.ts: ${pinOk}; == its RELEASE-MANIFEST.json pin: ${relOk}; quoted in MANIFEST.md and README.md: ${cited}; ${SITE.mod ? `the module loaded from that file exports what src/rng.ts exports (${names.join(', ')}): ${exportsOk}` : `the module did not load (${SITE.error})`}; ${rp24 ? `run side by side with src/rng.ts on every round MINES-07 replays, from the ${sets.length} shipped datasets (${scored} rounds of the 13 Oct phases and the ${R(O12).results.length} rounds of the 12 Oct file settled in their own record; its ${splitRecords.length} records of the one round split in two, not replayed there, are not replayed here): ${rounds} rounds, ${rp24.calls} calls (${Object.entries(rp24.byLabel).map(([k, v]) => `${k} ${v}`).join(', ')}; ${covered}/${names.length} exports exercised), ${rp24.differences} differing result${rp24.differences === 1 ? '' : 's'}${rp24.first ? ` (first: ${rp24.first})` : ''}` : 'not replayed'}`);
});
step(['MINES-25'], () => {
  const need = ['Verify a bet', 'Save the hashed server seed before you bet', 'rotate', 'sha256', 'not the 32 bytes', 'HMAC-SHA256', 'block b = floor(i / 8)', 'floor(', 'numbered 0', 'node verify-round.mjs'];
  const has = need.filter((w) => readme.includes(w));
  record('MINES-25', has.length === need.length, `README.md "Verify a bet" carries the save-the-hash-first step, where the seed is revealed, the fields, the commitment encoding, the HMAC key encoding (the seed's text, not hex-decoded), the draw with its block index, the tile numbering and a script that recomputes a round: ${has.length}/${need.length} markers${has.length < need.length ? ` (missing: ${need.filter((w) => !has.includes(w)).join('; ')})` : ''}`);
});
const artifactBad = input('artifactBad', () => (ARTIFACT_PINS.filter(([f, h]) => !existsSync(join(ROOT, f)) || sha256File(f) !== h)));
// MINES-28 and MINES-29 read COMMITTED records (outputs/fresh-copy.json, outputs/mutation-results.json), written by
// npm run gate:fresh / npm run mutate, pinned in RELEASE-MANIFEST.json, each carrying the fingerprint of the code and data it ran
// against (scripts/fingerprint.mjs). A record that is missing, unpinned, edited, or from other code is rejected (GAP).
const CODE_FP = input('CODE_FP', () => (codeFingerprint(ROOT)));
const relMan = input('relMan', () => (existsSync(join(ROOT, 'RELEASE-MANIFEST.json')) ? JSON.parse(readFileSync(join(ROOT, 'RELEASE-MANIFEST.json'), 'utf8')) : null));
const pinnedRecord = (rel: string) => { const p = join(ROOT, rel); if (!existsSync(p)) return { rec: null, why: 'no committed record' };
  const pinned = relMan?.files?.[rel]; const now = sha256File(rel);
  if (!pinned) return { rec: null, why: 'not pinned in RELEASE-MANIFEST.json' }; if (pinned !== now) return { rec: null, why: 'sha256 differs from its RELEASE-MANIFEST.json pin' };
  const rec = JSON.parse(readFileSync(p, 'utf8')); if (rec.codeSha256 !== CODE_FP) return { rec: null, why: `ran against other code or data (fingerprint ${String(rec.codeSha256).slice(0, 12)}…, now ${CODE_FP.slice(0, 12)}…)` };
  return { rec, why: '' }; };
step(['MINES-28'], () => {
  const { rec: fc, why } = pinnedRecord('outputs/fresh-copy.json');
  // The fresh copy must reproduce the committed record's verdict with that verdict's exit
  // code (0, 2 or 5 for a releasable package), not only a Full Pass
  const committedVerdict = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'outputs', 'verification-results.json'), 'utf8')).verdict; } catch { return null; } })();
  const ok = !!fc && fc.verdict === committedVerdict && fc.exit === exitOfVerdict(committedVerdict) && fc.rngTestsExit === 0 && fc.standaloneExit === fc.exit && fc.verdict === fc.standaloneVerdict && fc.reproduced === true && fc.beyondTolerance === 0 && fc.pinnedUnchanged === true && AUDIT_ID !== null;
  record('MINES-28', ok, fc ? `committed fresh-copy record (npm run gate:fresh, Node ${fc.node}, fingerprint == this code and data, pinned in RELEASE-MANIFEST.json): exit ${fc.exit}, standalone exit ${fc.standaloneExit}, verdict "${fc.verdict}" (== the committed record's "${committedVerdict}", whose exit is ${exitOfVerdict(committedVerdict)}: ${fc.verdict === committedVerdict && fc.exit === exitOfVerdict(committedVerdict)}), reproduced ${fc.reproduced}, regeneration vs committed ${fc.beyondTolerance} fields beyond tolerance, pinned artifacts unchanged ${fc.pinnedUnchanged}; audit ID ${AUDIT_ID ?? 'NOT ASSIGNED (pending, assigned by ProvablyFair.org)'}` : `fresh-copy record rejected: ${why}; audit ID ${AUDIT_ID ?? 'not assigned (pending, assigned by ProvablyFair.org)'}`);
  if (!fc && !why.startsWith('ran against other code')) pinFail('MINES-28', why);   // missing, unpinned or edited: FAIL, verdict-bearing (a record of other code stays a GAP)
});
step(['MINES-29'], () => {
  const { rec: mr, why } = pinnedRecord('outputs/mutation-results.json');
  const reg = JSON.parse(readFileSync(join(ROOT, 'tests', 'mutations.json'), 'utf8')).mutations.map((m: any) => m.id);
  const scoredIds = EXPECTED_SCORED;   // from profile/profile.json
  const consistent = !!mr && JSON.stringify(mr.registry) === JSON.stringify(reg) && mr.total === reg.length && Array.isArray(mr.results) && mr.results.length === reg.length
    && JSON.stringify(mr.results.map((r: any) => r.id).sort()) === JSON.stringify([...reg].sort()) && mr.killed === mr.results.filter((r: any) => r.killed).length;   // results are sorted by id, the registry is in file order
  const uncovered = mr ? scoredIds.filter((id) => !mr.results.some((r: any) => r.kills === id && r.killed)) : scoredIds;
  const ok = consistent && mr.killed === mr.total && uncovered.length === 0;
  record('MINES-29', ok, mr ? `committed mutation record (npm run mutate, fingerprint == this code and data, pinned in RELEASE-MANIFEST.json; registry and counts re-derived from its rows: ${consistent}): ${mr.killed}/${mr.total} mutations killed by their named check; scored checks with no killing mutation: ${uncovered.join(', ') || 'none'}` : `mutation record rejected: ${why}`);
  if (!mr && !why.startsWith('ran against other code')) pinFail('MINES-29', why);   // missing, unpinned or edited: FAIL, verdict-bearing (a record of other code stays a GAP)
});
step(['MINES-30'], () => {
  const dl = (manifest.match(/^\| DL-\d+ \|/gm) || []).length;
  const prem = /Could the data contradict it\?/.test(manifest);
  const ev = EVIDENCE_PINS.every(([f]) => manifest.includes(f.split('/').pop()!));
  record('MINES-30', dl > 0 && prem && ev, `MANIFEST.md: ${dl} declared-limitation rows; load-bearing premises with "Could the data contradict it?": ${prem}; every exhibit E01…E${String(EVIDENCE_PINS.length).padStart(2, '0')} listed by file name: ${ev}`);
});

// MINES-27 runs last, after every check the committed record holds has its row, so its comparison sees the whole record
step(['MINES-27'], () => {
  const gi = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
  const unignored = ARTIFACT_PINS.every(([f]) => gi.includes('!' + f));
  const noMeta = ARTIFACT_PINS.every(([f]) => existsSync(join(ROOT, f)) && !/"(runAt|generatedAt|timestamp|hostname|nodeVersion)"/.test(readFileSync(join(ROOT, f), 'utf8')));
  const cf = join(ROOT, 'outputs', 'verification-results.json');
  const recDiffs = existsSync(cf) ? beyondTolerance(fieldDiff(JSON.parse(readFileSync(cf, 'utf8')), recordOf())).length : -1;
  // verify.js is bundled from tests/verify.ts and src/; it must name the fingerprint of the sources on disk (a stale bundle is refused)
  const srcFp = sourceFingerprint(ROOT), bundleFp = bundledSourceFingerprint(ROOT); const bundleOk = bundleFp === srcFp;
  record('MINES-27', artifactBad.length === 0 && unignored && noMeta && censusSame && gate.tableMatches && recDiffs === 0 && bundleOk,
    `${ARTIFACT_PINS.length - artifactBad.length}/${ARTIFACT_PINS.length} artifacts match the sha256 pinned in src/artifact-pins.ts${artifactBad.length ? ` (mismatch: ${artifactBad.map(([f]) => f).join(', ')})` : ''}; un-ignored by name in .gitignore: ${unignored}; no run metadata: ${noMeta}; census regenerated == committed: ${censusSame}${censusMissing()}; RTP table regenerated == committed: ${gate.tableMatches}; committed verification record == this run's, field by field: ${recDiffs === 0}${recDiffs > 0 ? ` (${recDiffs} fields differ)` : recDiffs < 0 ? ' (no committed record)' : ''}; verify.js bundled from the sources on disk (fingerprint ${srcFp.slice(0, 12)}…, header ${bundleFp ? bundleFp.slice(0, 12) + '…' : 'none'}): ${bundleOk}; verify writes only outputs/run/`);
});

finish();

/** The verification record: every scored check except MINES-27 (the check that compares the record with this run), the
 *  informational check and the observations. Built the same way for MINES-27 and for outputs/run/. */
function recordOf() {
  const order = (id: string) => Number(id.split('-')[1]);
  // every package check (GRADED / RELEASE_GATE) is recorded too, except MINES-28, MINES-29: they attest this record itself
  // (MINES-28 and MINES-29 read gate records bound to sources that pin it), so verify prints them and does not record them
  const pkgRows = rows.filter((r) => (r.policy === 'GRADED' || r.policy === 'RELEASE_GATE') && !['MINES-28', 'MINES-29'].includes(r.id));
  // The placeholder rows (NOTRUN, added by finish()) stay out of the record, so a record regenerated from a run with a step
  // missing equals the one -27 builds mid-run; the missing ids are carried by the verdict
  const recRows = rows.filter((r) => (r.policy === 'HARD_FAIL' || r.policy === 'FLAG') && r.id !== 'MINES-27' && r.status !== 'NOTRUN').sort((a, b) => order(a.id) - order(b.id));
  const rf = recRows.filter((r) => r.status === 'FAIL').length, ro = recRows.filter((r) => r.status === 'FLAG' && r.origin === 'operator').length;
  const missing = notRun().filter((id) => id !== 'MINES-27');   // the record excludes MINES-27, which is recorded after it is first built
  const recVerdict = rtpClaimVerdict({ fails: rf, complete: missing.length === 0 && binding.ok, overstated: recRows.some((r) => r.status === 'OVERSTATED'), opFlags: ro }).verdict;
  return { suite: 'housebets-mines', profileSha256: binding.sha ?? 'absent', verdict: recVerdict,
    summary: { passes: recRows.filter((r) => r.status === 'PASS').length, fails: rf, overstated: recRows.filter((r) => r.status === 'OVERSTATED').length, operatorFlags: ro, captureFlags: recRows.filter((r) => r.status === 'FLAG' && r.origin === 'capture').length, packageChecks: pkgRows.length, excluded: ['MINES-27'] },
    steps: [...recRows.concat(rows.filter((r) => r.policy === 'INFORMATIONAL').sort((a, b) => order(a.id) - order(b.id))), ...pkgRows].sort((a, b) => order(a.id) - order(b.id)).map((r) => ({ id: r.id, status: r.status, origin: r.origin ?? null, detail: r.detail })),
    observations };
}

/** The exit code rtpClaimVerdict gives a verdict line (MINES-28 and scripts/fresh-copy-check.mjs use the same map). */
function exitOfVerdict(v: string | null): number | null {
  if (!v) return null; if (v.startsWith('NOT PROVABLY FAIR')) return 1; if (v.startsWith('INCOMPLETE')) return 3; if (v.startsWith('RTP FIGURE OVERSTATED')) return 5;
  if (v === 'PROVABLY FAIR — Conditional Pass') return 2; if (v === 'PROVABLY FAIR — Full Pass') return 0; return null;
}
/** The scored checks (HARD_FAIL + FLAG) the profile lists that this run did not record exactly once. */
function notRun(): string[] {
  return EXPECTED_SCORED.filter((id) => rows.filter((r) => r.id === id && r.status !== 'NOTRUN').length !== 1);
}
function finish() {
  applyTaint();
  const order = (id: string) => Number(id.split('-')[1]);
  // The verdict is bound to the profile's check list. A scored check with no row (step deleted, skipped, aborted) — or with
  // more than one — is printed as NOTRUN, the verdict is INCOMPLETE and the exit is non-zero; it can never print a PASS verdict.
  const missing = notRun();
  for (const id of missing) if (!rows.some((r) => r.id === id)) { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'NOTRUN', detail: 'this run recorded no status for this scored check' }); }
  rows.sort((a, b) => order(a.id) - order(b.id));
  const scored = rows.filter((r) => (r.policy === 'HARD_FAIL' || r.policy === 'FLAG') && r.status !== 'NOTRUN');
  const fails = scored.filter((r) => r.status === 'FAIL').length;
  const opFlags = scored.filter((r) => r.status === 'FLAG' && r.origin === 'operator').length;
  const over = scored.filter((r) => r.status === 'OVERSTATED').length;
  const capFlags = scored.filter((r) => r.status === 'FLAG' && r.origin === 'capture').length;
  const passes = scored.filter((r) => r.status === 'PASS').length;
  const complete = missing.length === 0 && scored.length === EXPECTED_STEPS && binding.ok;
  // RTP-CLAIM 1.2.0 ranking (rtpClaimVerdict): NOT PROVABLY FAIR (1) > INCOMPLETE (3) > RTP FIGURE OVERSTATED (5) > Conditional (2) > Full (0)
  const v = rtpClaimVerdict({ fails: fails + extraFails(), complete, overstated: over > 0, opFlags });   // + FAILs outside the scored rows and run errors
  const why = [missing.length ? `scored checks not run: ${missing.join(', ')}` : '', binding.ok ? '' : `profile binding: ${binding.issues.join('; ')}`].filter(Boolean).join('; ');
  const verdict = v.verdict === 'INCOMPLETE' ? `INCOMPLETE — ${why}` : v.verdict;
  const pkg = rows.filter((r) => r.policy === 'GRADED' || r.policy === 'RELEASE_GATE');
  console.log(`HouseBets House Games mines (new engine) — verification (profile MINES ${PROFILE_VERSION} ${binding.sha ? binding.sha.slice(0, 12) + '…' : 'ABSENT'}, ${rows.length} checks)`);
  for (const r of rows) console.log(`  ${r.id.padEnd(9)} ${(r.status + (r.origin === 'capture' ? '*' : '')).padEnd(6)} ${r.policy.padEnd(13)} ${r.name.padEnd(48)} ${r.detail}`);
  console.log(`  (* capture-origin FLAG: disclosed, verdict-neutral)`);
  for (const o of observations) console.log(`  OBSERVATION (not scored): ${o}`);
  console.log(`scored checks (HARD_FAIL + FLAG): ${passes} PASS, ${fails} FAIL, ${over} OVERSTATED, ${opFlags} operator FLAG, ${capFlags} capture FLAG of ${scored.length} run (profile: ${EXPECTED_STEPS} scored checks${missing.length ? `; NOT RUN: ${missing.join(', ')}` : ''}); informational ${rows.filter((r) => r.status === 'INFO').length}; package checks ${pkg.filter((r) => r.status === 'PASS').length}/${pkg.length} PASS (${pkg.filter((r) => r.status === 'GAP').map((r) => r.id).join(', ') || 'no gaps'})`);
  console.log(`profile binding: ${PROFILE_FILE} sha256 ${binding.sha ?? 'absent'} == the cited ${PROFILE_SHA256.slice(0, 12)}…, ${EXPECTED_STEPS} scored checks and every policy taken from it, src/profile-map.ts rows identical: ${binding.ok}${binding.ok ? '' : ' — ' + binding.issues.join('; ')}`);
  const failOutside = rows.filter((r) => r.status === 'FAIL' && r.policy !== 'HARD_FAIL' && r.policy !== 'FLAG').map((r) => r.id);
  if (failOutside.length) console.log(`FAIL outside the scored checks (verdict-bearing): ${failOutside.join(', ')}`);
  if (RUN_ERRORS.length) console.log(`run errors (${RUN_ERRORS.length}; any one fails the verdict): ${RUN_ERRORS.join(' | ')}`);
  console.log(`VERDICT: ${verdict}`);
  // the run record (outputs/run/ only) and its comparison with the committed record (MINES-27 requires them equal)
  const rec = recordOf();
  mkdirSync(join(ROOT, 'outputs', 'run'), { recursive: true });
  writeFileSync(join(ROOT, 'outputs', 'run', 'verification-results.json'), JSON.stringify(rec, null, 2) + '\n');
  const cf = join(ROOT, 'outputs', 'verification-results.json');
  if (existsSync(cf)) {
    const diffs = beyondTolerance(fieldDiff(JSON.parse(readFileSync(cf, 'utf8')), rec));
    console.log(`Reproduction vs the committed outputs/verification-results.json on Node ${process.versions.node}: ${diffs.length === 0 ? 'REPRODUCED' : `DIFFERS (${diffs.length} fields, e.g. ${diffs.slice(0, 2).map((d: any) => d.path).join(', ')})`}`);
  }
  console.log(`runtime ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exitCode = v.exit;
}
