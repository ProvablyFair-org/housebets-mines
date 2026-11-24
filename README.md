# HouseBets Mines — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** PF-2026-HB07 · **Release:** `v1.0.0` · **Capture:** 12–13 October 2026

**Result: PROVABLY FAIR — Full Pass.** Every replayed round, the 9,600 rounds of the 13 Oct phases and the 81 records of the
12 Oct file that hold a whole round, recomputes exactly from its revealed server seed under the algorithm HouseBets
publishes: the mine field in draw order, every tile's outcome, every multiplier and offer, and the payout. `node verify.js`
runs the 22 scored checks of the framework's MINES profile: 22 PASS, no FLAG and zero fails. One branch is declared, not
measured: no captured round came near the max win, so the max-win stop was never produced (DL-10); MINES-14 passes with it
declared unwitnessed, as the profile's rule reads.
MINES-16 (wallet reconciliation) passes on the platform's bet history and the account reconciliation; the comparison of consecutive balances the profile describes was not possible in this capture, because other games were captured on the same account at the same time (MANIFEST.md DL-3).

**Scope:** Live play on HouseBets House Games Mines (the engine served since October 2026, API slug `mines2`, fairness
version `canonical`) from one test account in a logged-in browser session, 12–13 October 2026: all four grids and every
mine count, stakes of 0.02, 2 and 10 USDT, auto bets and tile-by-tile play. Theoretical RTP is **99.0000% on every board, mine count and cash-out point, before rounding and before the max-win cap**: in all 4,122 (grid, mines, tiles) cells the multiplier formula × the counted survival
probability is exactly 99/100 (MINES-19), before each payout is rounded down to 1e-8. The survival probability is the count with every mine layout equally likely; the published draw map is within 2^-32 of equal at each pick and not exactly equal (MINES-08, worst deviation 2.2827 × 10^-10), and that difference is not carried into the figure. The observed return over the 8,500
Phase A rounds is 98.92%: variance, not RTP evidence. No external randomness beacon participates, and apart from two
deliberate negative tests (an empty client seed and a cash-out with no tile open)
the capture sent no adversarial request to the API (DL-11); the fairness-integrity tests, run separately on HouseBets'
running service by ProvablyFair.org, are in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity
Testing).

Audit report: https://audit.provablyfair.org/casino/housebets/games/mines/overview · Repository:
https://github.com/ProvablyFair-org/housebets-mines · The full write-up is [MANIFEST.md](MANIFEST.md); the verdict printed by
`node verify.js` is the verdict of record.

## What was verified

- **8,500 real rounds** placed on 13 Oct 2026 at 0.02 USDT, in 170 seed pairs of exactly 50 rounds: every one of the 170
  published boards (grids of 25, 36, 49 and 64 tiles, every mine count 1 … N − 1) played 50 times with one tile named up
  front, each round recomputed from its revealed server seed — the mine field in draw order, the outcome, the multiplier
  and the payout — against HouseBets' published algorithm (E01) and the rules on the game page (E02).
- **Supplementary sets** (13 Oct 2026): 150 rounds at 2 (100 × the Phase A stake) and 150 at $10 on a 25-tile board with
  1 mine, 200 rounds under four client seeds typed by the auditor, and 600 rounds played tile by tile (826 intermediate
  steps, 239 cash-outs, 361 busts), every step and every offer shown before a tile checked against the formula.
- **The 12 Oct capture**: its 81 records that hold a whole round are recomputed round by round, including 13 auto bets
  naming 2 to 40 tiles as the server settled them; one round split over two records by a resumed finish is not replayed
  (it is in the reconciliation).
- **Every scored 13 Oct round against the platform's own bet history** (E04), and the whole account's reconciliation (E05)
  checked by its numbers.
- **Simulation:** 1,000,000 rounds for each of the 170 boards (every mine count of every grid; 170,000,000 rounds), each
  board on its own auditor-chosen seeds independent of the operator (fixed labels, so the run reproduces byte for byte), tested for position uniformity,
  serial independence and RTP convergence on every (board, depth) cell with enough expected survivors; and every revealed
  seed of every dataset (202) replayed over 10,000 nonces to test for seed cherry-picking (MINES-21; detection power in
  MANIFEST.md DL-6).
- **The published 99 % RTP**, read at run time from the fairness answer (E01 "return") and the rules panel (E02 "the house
  keeps 1%", and the 16 Oct rewording "(1% house edge)" in the live copy, E08), against the exact RTP of the multiplier
  formula in all 4,122 (grid, mines, tiles) formula cells, before rounding and before the max-win cap (at a large enough stake the
  cap stops a round before its deepest cells, so not every cell is a cash-out a player can reach at every stake).
- **Observed return** (variance, not RTP evidence): Phase A 168.15749796 paid on 170 staked, 98.92%.
- **The 24-hour rule**, observed once: a round left open on purpose on 12 Oct was finished by the server 25 h 8 m 42 s after
  its last decision and cashed out at its value. Its payout is scored; the timing and the branch the capture never produced
  are reported as an observation (MANIFEST.md#limitations-and-trust).

## Run the audit

Nothing to install: `node verify.js` runs on Node 22, `npm test` (the TypeScript sources) on Node 22.6 or later:

```
node verify.js          # the standalone verifier (generated from tests/verify.ts by npm run build:standalone)
npm test                # the same suite from the TypeScript sources, plus the RNG reference vectors
```

Expected: `scored checks (HARD_FAIL + FLAG): 22 PASS, 0 FAIL, 0 OVERSTATED, 0 operator FLAG, 0 capture FLAG of 22 run (profile: 22 scored checks); informational 1; package checks 7/7 PASS (no gaps)`, then `VERDICT: PROVABLY FAIR — Full Pass`, `REPRODUCED`, exit 0.

`npm run mutate` runs the falsifiability battery (each mutation must change the status of the step it names from its
status in an unmutated copy; a step that aborts counts as not caught) and writes `outputs/mutation-results.json`;
`npm run gate:fresh` (run it in a disposable copy of the package: a passing run rewrites the pinned record
`outputs/fresh-copy.json`, which names the Node version, so on another Node 22 patch the rewritten record no longer equals its pin) re-runs the package from a fresh copy, compares the regenerated artifacts with the committed ones and
writes `outputs/fresh-copy.json`. Both records carry the fingerprint of the code and data they ran against and are pinned
in RELEASE-MANIFEST.json, which pins every file of the package except itself; `node scripts/release-manifest.mjs --check`
confirms every pinned file and rebuilds `site-verifier/derive.js` with bun 1.3.9, requiring the shipped file to equal the
rebuild. `verify` re-runs the whole simulation (170 boards × 1,000,000 rounds and 202 seeds × 10,000 replayed
nonces) rather than trusting the stored results: on an Apple M2 Max (12 cores, Node 22.23.1) it took 1,092 s (18.2 minutes) of wall time and 1,090 s of CPU time, measured on 19 Nov 2026 at load average 9. A run in which a scored check of the framework
profile (`profile/profile.json`, its sha256 checked) records no status, or whose step list departs from that profile, prints
`VERDICT: INCOMPLETE` and exits 3, provided nothing else FAILs (a FAIL ranks first and exits 1; a step deleted without
regenerating the committed record also fails MINES-27).

## Verdict and exit codes

`node verify.js` (and `npm run verify`) ends with one `VERDICT:` line and its exit code. Framework 1.1; RTP-CLAIM 1.2.0 is
switched on (Methodology v1.1). The codes and their order are the same in all 11 HouseBets new-engine packages:

| exit | verdict | when |
|---|---|---|
| 0 | PROVABLY FAIR — Full Pass | every scored check passes (a capture-origin FLAG is disclosed and does not move the verdict) |
| 2 | PROVABLY FAIR — Conditional Pass | an operator-origin FLAG, nothing worse |
| 5 | RTP FIGURE OVERSTATED | MINES-19: the published RTP figure is missed on the house side by more than 0.1 pp; the draws pass |
| 3 | INCOMPLETE | a scored check of the profile has no status from this run, or `src/profile-map.ts` departs from `profile/profile.json`, and no check FAILs |
| 1 | NOT PROVABLY FAIR | a scored check fails; or a step throws (a file missing, a dataset field null or absent: the checks it scores print FAIL with the error, the other steps still run); or a release-gate record (`outputs/fresh-copy.json`, `outputs/mutation-results.json`) is missing or is not the bytes RELEASE-MANIFEST.json pins (its check prints FAIL) |
| 4 | (no verdict) | `verify.js` was not built from the sources beside it; rebuild with `npm run build:standalone` |

When more than one applies: NOT PROVABLY FAIR > INCOMPLETE > RTP FIGURE OVERSTATED > Conditional Pass > Full Pass.

## Verify a bet

Check your round at [provablyfair.org/verify-bets/housebets](https://www.provablyfair.org/verify-bets/housebets); the
page runs `site-verifier/derive.js` from this release (sha256 `e50f0c82ff03a1f56140d9a9b0dda0dcb1621b112126bf4c5f24792168e54adf`).
MINES-24 runs that file side by side with `src/rng.ts` on every replayed round (MANIFEST.md, Player verifiers). The steps
below, and the script after them, check a round by hand, without the page.

1. **Save the hashed server seed before you bet.** Before your first round on a seed pair, save the `hashedServerSeed` of
   your active pair. That saved copy is what shows the seed was fixed before your rounds: a match against a hash read after
   the rounds only shows consistency (hash equality), because a seed and hash made after the round would also match. This
   package reads the hash from the game's seed-pair answer; where the game's screen shows it was not captured (DL-4).
2. **Reveal the seed.** A round can only be checked once its server seed is revealed, which happens when you rotate the seed
   pair: the server's answer to the rotation (`POST /housegames/change_seed`) carries the previous server seed. That is what
   the API and the game's code show; the rendered verify screen was not captured for this package (DL-4).
3. **Collect the fields:** the revealed server seed, your client seed, the round's nonce (HouseBets nonces start at 1 on a
   fresh seed pair and count every round), the board size N and the number of mines m.
4. **Check the commitment:** `sha256` of the server seed's text (UTF-8), as lowercase hex, must equal the hashed server seed
   you saved in step 1.
5. **Recompute the mines.** The HMAC key is the server seed's **64-character hex text, encoded as UTF-8**, not the 32 bytes
   that text hex-decodes to. HouseBets does not hex-decode the seed: with a
   hex-decoded key, 16 of the 8,500 Phase A rounds give the served mine set. For block b = 0, 1, … compute `block_b = HMAC-SHA256(key = server seed,
   message = "clientSeed:nonce:b")` and concatenate them; each block yields 8 draws. Draw i (i = 0, 1, …) is bytes
   4i..4i+3 of `block_0 ‖ block_1 ‖ …` read as a big-endian 32-bit integer u, so draw i comes from block b = floor(i / 8).
   Keep the tiles not yet picked in ascending order; mine i is the tile at position `floor(u × (N − i) / 2^32)` among them.
   The first m picks are the mines, in the order the round's `field` lists them. Tiles are numbered 0 to N − 1 from left to
   right, top to bottom.
6. **Apply the published rule** (E01, E02): a mine ends the round and pays nothing; after k safe tiles the multiplier is
   0.99 × C(N, k) / C(N − m, k); the payout is stake × multiplier rounded down to 0.00000001 once. **Max win:** a tile is
   opened only while its payout minus the stake stays within the round's max win (E01 rules: "a tile that would take the
   cash-out value past it is not opened"; the limits answer gives 1,000,310.0961298 USDT). At a large stake the deepest
   tiles are therefore not available and the round is cashed out before them. No captured round came near the max win, so
   this branch is the published rule, not an observed settlement (MANIFEST.md DL-10).

The script below does steps 4 and 5. Its constants hold the worked example V3 of [docs/ALGORITHM.md](docs/ALGORITHM.md)
(round `b42e1a84-4ee6-4a65-b21e-2de338a06597`, Phase A: grid 49, 22 mines, nonce 1); replace them with your round's values. Save it as a `.mjs` file and run it with `node` (Node 18 or later, nothing to install).

```javascript
// node verify-round.mjs — paste your round's values into the constants below
// serverSeedHashed: the hashed server seed you saved BEFORE your first round on this seed pair
import { createHash, createHmac } from 'node:crypto';
const serverSeed = 'f7992ebda863e093934521e71b908ce6faf6446a8207479afa634084a0c84be5';
const serverSeedHashed = 'ddc689eb3d11a1b8e91024cab42585d9020a3dc40d0fe92fb453d217b6b72ed1';
const clientSeed = 'pfminesstartf44263ebb003eae7ec4131c20b0413ba', nonce = 1, N = 49, m = 22;
const field = [4, 33, 23, 6, 5, 12, 29, 41, 34, 45, 15, 31, 9, 14, 11, 39, 8, 3, 46, 26, 1, 0];   // the round's `field`, in order

const key = Buffer.from(serverSeed, 'utf8');   // the seed's 64-character text as UTF-8, NOT hex-decoded
const hashMatches = createHash('sha256').update(key).digest('hex') === serverSeedHashed;
const left = Array.from({ length: N }, (_, t) => t), mines = [];
let block;
for (let i = 0; i < m; i++) {                  // draw i reads bytes 4i..4i+3 of block_0 ‖ block_1 ‖ …: block b = floor(i / 8)
  const b = Math.floor(i / 8);
  if (i % 8 === 0) block = createHmac('sha256', key).update(`${clientSeed}:${nonce}:${b}`).digest();
  const u = block.readUInt32BE(4 * (i % 8));
  mines.push(left.splice(Math.floor(u * (N - i) / 2 ** 32), 1)[0]);
}
console.log(JSON.stringify({ hashMatches, mines, matches: JSON.stringify(mines) === JSON.stringify(field) }));
```

On the example it prints `{"hashMatches":true,"mines":[4,33,23,6,5,12,29,41,34,45,15,31,9,14,11,39,8,3,46,26,1,0],"matches":true}`:
the served field, in the served order. `hashMatches: true` is hash equality with the value you pasted; paste the one you
saved before betting. Tile 19, the tile the round opened, is not among the mines, so the round won at k = 1: multiplier
4851/2700, payout floor8(0.02 × 4851/2700) = 0.03593333, as served.

`src/rng.ts` and `src/rules.ts` are the same steps in the package's code; [docs/ALGORITHM.md](docs/ALGORITHM.md) states the
algorithm step by step with its sources and test vectors, and [docs/INTERFACE.md](docs/INTERFACE.md) the module interface.

## Files and evidence

- [Phase A dataset](data/housebets-mines-phaseA-auto1-8500rounds.json) — 8,500 rounds, SHA-256 `9dad19c845c17c2ccae3604f7be607cfecef4e918ffbe3ca9e8965c72de4c791`.
- [Phase C](data/supplementary/housebets-mines-phaseC-elevated-150rounds.json) — 150 rounds at 2, SHA-256 `19a6332806364ea4e7eda3bc99bd637a4192f57aab07982ff760a2719e21b57c`.
- [Phase C, $10 set](data/supplementary/housebets-mines-phaseC-elevated-10usd-150rounds.json) — 150 rounds at 10, SHA-256 `7443b8837146d70fc2bdece7f03f5d0c8605ba352e29b1d7394a5a358eec33c5`.
- [Phase D](data/supplementary/housebets-mines-phaseD-playerseeds-200rounds.json) — 200 rounds under player-set seeds, SHA-256 `d71f53cfd882669a59c7585a39f8040c9afcf3d4970510886df96bbf7c33ad1a`.
- [Phase E](data/supplementary/housebets-mines-phaseE-multistep-600rounds.json) — 600 tile-by-tile rounds, SHA-256 `705e537a16cb2ca9ce1119ef65c8dcaca1d28d7c620d7d258241b7e309bdbd34`.
- [12 Oct file](data/supplementary/housebets-mines-full-83rounds-withopen.json) — 83 records, SHA-256 `318711cfd81fa261c1f229ac6441999e5e9b988fd0217fc4157dcc7012176126`.
- `docs/` the algorithm specification and module interface · `evidence/` E01–E08 · `profile/` the framework's MINES profile
  1.0.3-public (byte copy, sha256 checked by verify) · `capture/` a redacted reference copy of the capture code (the as-run
  script, sha256 `4bf69ed0…` in the 13 Oct datasets' meta, is held privately; MANIFEST.md#evidence) · `outputs/` the pinned simulation census, RTP table and verification record,
  and the committed mutation and fresh-copy records · `src/` the derivation and the round replay · `tests/verify.ts` the 30
  checks of the MINES profile · `scripts/` evidence builder, mutation battery, fresh-copy gate, standalone build, release
  manifest, code fingerprint, site-verifier build · `site-verifier/derive.js` the ProvablyFair.org verifier module for this
  game, generated from `src/rng.ts`. Every dataset is pinned in `src/loader.ts` and checked by MINES-26. See MANIFEST.md#evidence.
- [Audit report](https://audit.provablyfair.org/casino/housebets/games/mines/overview) · [Public repository](https://github.com/ProvablyFair-org/housebets-mines) · [MIT license](LICENSE).

The release commit and tag are signed with the ProvablyFair.org release key (SSH,
`SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY`), which the release manifest records.
