# HouseBets Mines — Consolidated Audit Overview (new engine)

**Release:** `v1.0.0` (the first public release) · **Audit ID:** PF-2026-HB07 · **Auditor:** ProvablyFair.org · **Framework:** 1.1

Audit report: https://audit.provablyfair.org/casino/housebets/games/mines/overview · Repository:
https://github.com/ProvablyFair-org/housebets-mines. The machine-readable release identity is in
[RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

Verdict of record: the one `node verify.js` prints;
on 27 Oct 2026 it is **PROVABLY FAIR — Full Pass**: of the 22 scored checks, 22 PASS, 0 FAIL and 0 FLAG (MINES-14 passes
with the max-win branch declared unwitnessed: the capture never came near the max win, DL-10). The verdict is
bound to the framework profile, shipped as `profile/profile.json` (sha256 checked at run time): a run in which a scored check
of that profile records no status, or whose step list or policies depart from it (`src/profile-map.ts`), prints INCOMPLETE and
exits 3, unless a check also FAILs, which ranks first (exit 1). One observation the MINES profile has no check for (the 24-hour rule's timing) is reported below, not scored.
Framework 1.1 (Methodology v1.1, 14 Oct 2026): RTP-CLAIM 1.2.0 is switched on, so an RTP figure overstated on the
house side is reported as **RTP FIGURE OVERSTATED** (exit 5), never NOT PROVABLY FAIR. That holds in code: the published
figure is read from the exhibits at run time (no constant holds it), and the Pass 1 simulation (MINES-20) is tested against
each cell's exact derived RTP, never against the published figure; mutations M19b and M19c end RTP FIGURE OVERSTATED, exit 5.
Exit codes under [Reproduce the audit](#reproduce-the-audit).

## Contents

[Conclusion and scope](#conclusion-and-scope) · [Dataset and capture](#dataset-and-capture) ·
[Game and algorithm](#game-and-algorithm) · [Payouts and RTP](#payouts-and-rtp) ·
[Verification results](#verification-results) · [Player verifiers](#player-verifiers) · [Reproduce the audit](#reproduce-the-audit) · [Evidence](#evidence) ·
[Limitations and trust](#limitations-and-trust) · [Release history](#release-history)

## Conclusion and scope

Every scored mines round recomputes exactly from its revealed server seed under the algorithm HouseBets publishes: the
9,600 rounds of the 13 Oct phases and the 81 records of the 12 Oct file that hold a whole round (one round of 12 Oct, split
over two records by a resumed finish, is not replayed; it is in the account reconciliation). Recomputed: the mine field in
the order the server lists it, the outcome of every tile opened, every intermediate multiplier and value, every offer shown
before a tile (next multiplier and value), and the payout. The 9,600 scored rounds of 13 Oct appear in the platform's own
bet history with the same stake and payout (E04); the 12 Oct file is reconciled by its totals (E05). The draw is within
2^-32 of uniform on every range the game uses (worst deviation 2.2827 × 10^-10), and the published flat 99 % RTP holds
exactly for the multiplier formula in all 4,122 cash-out cells (paid amounts are rounded down to 1e-8, which costs at most
4.69 × 10^-7 at the 0.02 stake). Pass 2, replaying every revealed seed of every dataset (202) over 10,000 nonces, finds no
significant deficit in the nonces actually played: the scored per-slot standardised return over the 9,682 played slots is
at z 0.495, one-sided p 0.6897, a test that detects a uniform deficit of 2.15 pp per round at 80 % power. It does not detect a
deficit confined to the 988 slots whose multiplier is 10× or more: that would take 148.5 pp per round on those slots, more than
a round can lose; a separate test on those slots alone, printed and not scored, would detect 47.5 pp (DL-6).

**Theoretical RTP is 99.0000% on every board, mine count and cash-out point, before rounding and before the max-win cap**: in all 4,122 (grid, mines, tiles) cells the
multiplier formula × the survival probability counted from the combinatorics is exactly 99/100 (MINES-18, MINES-19), before
each payout is rounded down to 1e-8. The survival probability is the count with every mine layout equally likely; the published draw map is within 2^-32 of equal at each pick and not exactly equal (MINES-08, worst deviation 2.2827 × 10^-10), and that difference is not carried into the figure. The observed return of the 8,500 Phase A rounds, 98.92%, illustrates variance only.

The dataset comes from a single test account in a logged-in browser session. Apart from two deliberate negative tests (an
empty client seed, E06; a cash-out with no tile open, sent twice)
the capture sent no adversarial request to the API (DL-11); the fairness-integrity tests, run separately on HouseBets'
running service by ProvablyFair.org, are in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity
Testing). No
external randomness beacon participates, so seed selection by the operator before commitment remains residual trust; Pass 2
found no evidence of it. These are scope boundaries, recorded under [Limitations and trust](#limitations-and-trust).

Scope: HouseBets House Games **mines** on the October 2026 engine (`mines2`, fairness version `canonical`), the USDT wallet,
all four grids and every mine count, auto bets (tiles named up front: one tile in every scored 13 Oct auto bet; 2 to 40
tiles in 13 server-settled auto bets of 12 Oct, MINES-17) and tile-by-tile play. Not in scope: other House
Games (their own packages), the security of the platform, the free round (stake 0, DL-8), and anything a client-side
capture cannot reach.

## Dataset and capture

| file | what | rounds | seeds |
|---|---|---|---|
| `data/housebets-mines-phaseA-auto1-8500rounds.json` | **Phase A, primary**: 170 whole seed pairs of exactly 50 rounds, 0.02 USDT, one tile named up front; each of the 170 (grid, mine count) boards 50 times; 13 Oct 2026 | 8,500 | 170 |
| `data/supplementary/housebets-mines-phaseC-elevated-150rounds.json` | **Phase C**: grid 25, 1 mine, one tile, stake 2 (100 × the Phase A stake), 13 Oct | 150 | 3 |
| `data/supplementary/housebets-mines-phaseC-elevated-10usd-150rounds.json` | **Phase C, $10 set**: same board at 10, 13 Oct | 150 | 3 |
| `data/supplementary/housebets-mines-phaseD-playerseeds-200rounds.json` | **Phase D**: one auditor-typed client seed per pair, 0.02, 13 Oct | 200 | 4 |
| `data/supplementary/housebets-mines-phaseE-multistep-600rounds.json` | **Phase E**: tile-by-tile rounds on 81 boards over all four grids, depths 0–5 at settle, 13 Oct | 600 | 12 |
| `data/supplementary/housebets-mines-full-83rounds-withopen.json` | the 12 Oct capture (pairs of 10 rounds): manual, auto and negative-test rounds, the round left open on purpose and the server's close of it 25 h 8 m 42 s after the last decision; 81 of its 83 records hold a whole round and are recomputed round by round (DL-9) | 83 records, 82 rounds | in MINES-01's 202 |

The capture ran inside a logged-in browser tab on an account opened for the audit, placing rounds through the game's own API
calls. For every seed pair it read the pair (the hash of the server seed and the hash of the next one), drew the client
seed from `node:crypto randomBytes(16)` after reading the hash, except on the 4 Phase D pairs, whose client seeds were chosen before the capture (DL-1), played 50 rounds, read the server's nonce count, and
rotated, which reveals the server seed. A pre-capture read anchors each dataset's chain before its first pair, and a read
after the last rotation closes it.

**Account identity (13 Oct 2026).** No field in this package carries the audit account's user id. The mines answers the
capture recorded have no user-id field, and a search of every shipped file for the account's id finds 0 occurrences, so
nothing was replaced or redacted. The shipped datasets are byte-identical to the as-captured files (same sha256 as in the
HouseBets workshop).

**Every mines bet of the account's 12–13 October capture is in this package.** E05's mines rows sum to 9,682 rounds, the rounds
of this package's six files (9,600 scored on 13 Oct + 82 in the 12 Oct file; MINES-16). E05 attributes the account's other
entries to the other games' files and to 13 entries from 10 Oct, whose games E05 does not name: the statement above is about the capture, not about those 13 earlier bets. No same-engine mines capture is held back.

## Game and algorithm

From HouseBets' published spec (E01, `GET /housegames/mines2/fairness`) and the rules panel of the game page (E02):

- **Draw.** `block_i = HMAC-SHA256(key = serverSeed as UTF-8, message = "clientSeed:nonce:i")`; the bytes are read four at a
  time, big-endian, as `u`; the i-th mine is the tile at position `floor(u × (N − i) / 2^32)` among the tiles not yet
  picked, kept in ascending order. A board with m mines is the first m picks; the server's `field` lists them in that draw
  order and matched it on every round (MINES-07). The spec's five worked boards recompute (MINES-09).
- **Commitment.** The hashed server seed shown before the rounds is `sha256` of the seed's UTF-8 text (202 of 202 revealed
  seeds, MINES-01); each pair also shows the hash of the next seed, and every chain of the 13 Oct phases links (MINES-02).
- **Nonces** start at 1 on a fresh pair and count every round (MINES-04).
- **Bias.** For every range n = 2 … 64 the map is monotone and the counts sum to 2^32 (for n = 25 every position gets
  171798691 or 171798692 of the 2^32 values of `u`); worst deviation from 1/n is 2.2827 × 10^-10 (n = 51), below the
  profile's 2^-32 ceiling (MINES-08). No modulo step, no rejection.
- **Rules** (E01 rules, E02 verbatim): a mine ends the round and pays nothing; cash-out needs at least one safe tile;
  opening the last safe tile cashes out; tiles named up front are opened in order and a round that meets no mine is cashed
  out at once; a tile that would take the cash-out past the round's max win is not opened; E02 rulesMinesIdle: "A round left
  without a decision for 24 hours is finished by the server: with tiles open it is cashed out at its value; with none, the
  first tile is opened and, if safe, cashed out."

## Payouts and RTP

- **Multiplier** after k safe tiles on N tiles with m mines = 0.99 × C(N, k) / C(N − m, k) (E01, E02 rulesMinesFormula).
  The server's `multiplier` field is the nearest binary64 to that exact fraction: 4,907 of 4,907 winning settles and 1,118 of
  1,118 intermediate steps (13 Oct phases and 12 Oct, MINES-13). Every multiplier exceeds 1 and rises strictly with depth
  and with mine count (MINES-14).
- **Offers.** Before every tile the game shows the next tile's multiplier and value (`next`). Both equal the formula at the
  next depth, and cash-out is offered exactly when a tile is open: 1,779 of 1,779 answers (Phase E and 12 Oct, MINES-17).
- **Payout** = stake × the exact fraction, rounded down to 0.00000001 once (E01, E02 rulesMinesPayout); exact on 9,680 of
  9,680 rounds that settled by a decision, and the round the server finished under the 24-hour rule paid exactly its value
  (MINES-11). Every amount the server sent is on the 1e-8 grid: 9,681 of 9,681 rounds (MINES-11).
- **Win probability** = C(N − m, k) / C(N, k), checked equal to the product form in exact integers for all 4,122 cells
  (MINES-18).
- **RTP.** HouseBets states the return in three places in our evidence, all read in the game's answers or code, none on a
  rendered page (P-2): in the game settings the site loads, the fairness answer "99% for every board and every number of
  tiles opened" (E01 "return"; the live game bundle requests that answer, `qt("/"+Qe+"/fairness")` then `setFairnessSpec`, in
  the bundle E02 cites, sha256 e8e5d68f…); and in the rules panel of that bundle, "That is {pct}% of the fair odds for
  opening k safe tiles in a row — the house keeps 1%" (E02 rulesMinesFormulaWords). The panel also carries the template
  "The return is exactly {pct}% at every cash-out point, for every board and every mine count" (E02 rulesMinesRTP), whose
  `{pct}` the page fills at run time, so it states no figure in our evidence. HouseBets reworded that template after the
  capture: the live copy of the same bundle (fetched 19 Oct 2026, last-modified Fri, 16 Oct 2026 09:18:09 GMT) reads
  "Theoretical RTP before rounding and any payout cap: {pct}% (1% house edge). A capped payout can reduce the return."
  (E08 rulesMinesRTP), which states the edge as a figure. MINES-19 reads all three figures from the exhibits at run time and
  holds the game to the highest (all 99 %).
  For the multiplier formula, C(N − m, k)/C(N, k) × 99·C(N, k)/(100·C(N − m, k)) = 99/100 in every one of the 4,122 cells
  (`outputs/rtp-claim-table.json`, RTP-CLAIM 1.2.0, switched on: MINES-19 PASS). Paid amounts are rounded down to 1e-8,
  which costs a 0.02 stake at most 4.69 × 10^-7 of RTP (grid 64, 1 mine, 2 tiles).
- **Simulation.** Each of the 170 boards (every mine count of every grid) has 1,000,000 rounds on its own seeds
  (170,000,000 rounds; the cash-out depths of one board are settled on that board's rounds). All 2,722 cells with at least
  30 expected surviving rounds land within 5·SE + 1e-4 of the cell's exact
  derived RTP, 99/100 in every cell, never the published figure (worst 3.53 SE). The band's half-width runs from 7.236 × 10^-4 (grid 64, 1 mine, 1 tile) to 8.945 × 10^-1 (grid 36, 14 mines,
  15 tiles); in 1,976 of the 2,722 scored cells it is wider than the 1 % house edge, so in those cells the band could not
  detect an edge of that size from this sample (MINES-20). Live-round returns are variance only; RTP evidence is the exact
  table and the simulation.
- **Observed return** (variance, not RTP evidence): Phase A 168.15749796 paid on 170 staked, **98.92%**; Phase C 305.25 on
  300 (101.75%), the $10 set 1,515.9375 on 1,500 (101.06%), Phase D 4.67289098 on 4 (116.82%), Phase E 10.01092414 on 12
  (83.42%). A live sample of this size cannot confirm or reject a 1 % edge; the RTP evidence is the exact table and the
  simulation.

## Verification results

`node verify.js` runs the 30 checks of the framework's MINES profile 1.0.3-public, shipped as `profile/profile.json` (a byte
copy of the framework's `games/mines/profile.public.json`, sha256 fb425fc9…, committed in the framework at 19f8dc7, 27 Oct
2026: the public form of 1.0.3, every check's id, name, layer, kind, policy and rule unchanged). verify checks that sha256, takes the scored list and every
policy from that file, and requires `src/profile-map.ts` to carry the same rows. 17 Nov 2026, Node 22: 22 of 22 scored checks PASS, 0 FLAG,
0 FAIL; MINES-22 informational; package checks 7 of 7 PASS; verdict **PROVABLY FAIR — Full Pass**. The committed record and RELEASE-MANIFEST.json count 21 passes: they leave out MINES-27, the check that compares the record with the run. The full per-check
output is `outputs/verification-results.json`. That record holds every check of the run except MINES-27, MINES-28 and MINES-29, which attest the record itself: MINES-27 compares it with the run, and MINES-28 and MINES-29 read the gate records (`outputs/fresh-copy.json`, `outputs/mutation-results.json`), which are bound to a code fingerprint that includes the record; verify prints those three and does not record them.

Status is the one `node verify.js` prints: PASS, FLAG (capture: a capture-origin FLAG), GAP (a package check not met), INFO
(informational, never in the verdict). Where a row holds two or three checks, the statuses are in the same order.

| check | status | result |
|---|---|---|
| MINES-01 seeds | PASS | 202/202 revealed seeds hash to their commitments (170 Phase A); 6/6 pre-capture reveals |
| MINES-02 chain | PASS | A 169/169 links, C 2/2, C $10 2/2, D 3/3, E 11/11; each anchored before its first pair and closed by the pair active after it |
| MINES-03 / 04 | PASS · PASS | every pair: one hash and client seed; nonces exactly 1..50, N == the server's count; 9,600/9,600 rounds at nonce = count + 1 (12 Oct 81/81); every server answer of a round (bet, each action, game_detail) carries the same hash, client seed, nonce and round id as the settled block the recompute uses, and the capture's own copies (round id, seed and hash read before the round, outcome label) agree: 9,681/9,681 rounds |
| MINES-05 population | PASS | 8,500 / 170 / 170 × 50 against code constants; C 150, C $10 150, D 200, E 600, all whole pairs of 50 |
| MINES-06 client seed | PASS | a wrong client seed changes 8,494/8,500 fields (6 identical, 5.35 expected); Phase D 200/200 recompute under 4 player seeds; empty seed refused (E06) |
| MINES-07 / 10 / 11 | PASS · PASS · PASS | fields in draw order 9,600/9,600 (13 Oct) and 81/81 (12 Oct); outcomes 9,681/9,681; payouts 9,680/9,680 plus the 24 h round at its value; every amount on the 1e-8 grid; Phase A wins opened exactly the chosen tile, busts hit it |
| MINES-08 | PASS | bias ≤ 2^-32 (worst 2.2827 × 10^-10) |
| MINES-09 (package) | PASS | E01's 5 worked boards and 8 worked multipliers and payouts recompute, and so does captured round 0; also `tests/rng.test.ts` |
| MINES-12 | PASS | Phase C 150/150 (148 wins) and the $10 set 150/150 (147 wins) recompute and pay by the base rule |
| MINES-13 / 14 | PASS · PASS | multipliers exact as binary64 on 4,907 settles and 1,118 steps; monotone and > 1 in all 4,122 cells; no win above the max win; 0 of the 11,459 request answers offered a max-win stop, so the max-win branch is declared unwitnessed (DL-10), which the rule allows |
| MINES-15 | PASS | 170/170 boards × 50; first picks cover every tile of every grid; Phase E 4 grids, 81 boards, depths 0–5 at settle |
| MINES-16 | PASS | 9,600/9,600 scored 13 Oct rounds in the platform's bet history with the same stake, payout and status (E04); the 24 h round's row (E07); E05 checked by its numbers: 60 dataset rows sum to its TOTAL, the ledger line adds up (86,979 = 86,966 + 0 + 13), balance after − net + open == 986.84718000; each of the 6 package files' rows (rounds, staked, paid) == the package's own sums (12 Oct: 82 rounds from 83 records); E05's mines rows 9,682 == this package's rounds; the pass rests on that bet history and that account reconciliation: the comparison of consecutive balances the profile describes was not possible in this capture (DL-3) |
| MINES-17 | PASS | Phase E 600/600: rungs, reveals, cash-outs, mine-set invariance, and every offer shown before a tile (1,779/1,779 answers with 12 Oct); 13 server-settled auto bets naming 2 to 40 tiles (12 Oct) replay from the derived field; order independence is computed by the package, not a server answer |
| MINES-18 / 19 | PASS · PASS | survival probability from combinatorics, negative control rejected; RTP exactly 99 % in every cell, against the 99 % read at run time from E01 "return", E02 rulesMinesFormulaWords and E08 rulesMinesRTP |
| MINES-20 | PASS | 170 boards × 1,000,000 rounds, each board on its own seeds: 340 uniformity tests, smallest p 4.512 × 10^-3 (Bonferroni bar 7.353 × 10^-6); lag-1 and runs on pick 0 within bounds; 2,722/2,722 scored RTP cells in band (half-widths and the 1,976 cells wider than the edge above); 1,400 of the 1,400 unscored deeper cells in band (DL-5) |
| MINES-21 | PASS | every revealed seed of every dataset, 202 (A 170, C 3, C $10 3, D 4, E 12, 12 Oct 10), × 10,000 nonces, each nonce replaying a round the capture played on that seed; scored per-slot standardised return over the 9,682 played slots: early-window z 0.495, p 0.6897 (reference window z −0.462); per dataset, printed: A −0.096, C 1.667, C $10 1.250, D 1.512, E −0.067, 12 Oct 0.233; the pooled Phase A return scored until 14 Oct: z −0.042, p 0.4834; 94 Phase A pairs below expectation, 76 at or above; power: a 2.15 pp per-round RTP deficit at 80 % (DL-6) |
| MINES-22 (info) | INFO | first-mine positions per grid: chi² p 0.154 / 0.874 / 0.335 / 0.588; wins 4,252 vs 4,250.0 expected |
| MINES-23 (package) | PASS | the S5 matrix below carries the framework's eight rows, ids and names in order, each with a result and what it is tied to; verify checks the ids and the names, not a count |
| MINES-24 (package) | PASS | `site-verifier/derive.js`, sha256 `e50f0c82ff03a1f56140d9a9b0dda0dcb1621b112126bf4c5f24792168e54adf`, generated from `src/rng.ts`: equals its pins (`src/artifact-pins.ts`, RELEASE-MANIFEST.json) and returns what `src/rng.ts` returns on all 9,681 rounds MINES-07 replays (38,926 calls, 0 differing results; [Player verifiers](#player-verifiers)) |
| MINES-25 (package) | PASS | README "Verify a bet": save the hash first, reveal, fields, commitment encoding, HMAC key encoding, draw with its block index, tile numbering, and a script that recomputes a round |
| MINES-26 / 27 | PASS · PASS | 6 datasets, 8 exhibits and 3 artifacts match their pins; MIN_STAKE and MAX_WIN equal E03, the multiplier coefficient 99/100 equals E01 "multiplier" and E02 rulesMinesFormula, and the published return parses from E01 and E02 (a constant that departs from its exhibit is a FAIL); regenerated census and RTP table == committed; verify.js is bundled from the sources on disk (a stale bundle fails MINES-27) |
| MINES-28 / 29 | PASS · PASS | read only the committed, RELEASE-MANIFEST-pinned records `outputs/fresh-copy.json` and `outputs/mutation-results.json`, each carrying the fingerprint of the code and data it ran against (`scripts/fingerprint.mjs`); a record that is missing, edited or unpinned prints FAIL and fails the verdict (exit 1); one from other code is a GAP. MINES-28: the fresh copy reproduces the verdict and its exit code, audit ID PF-2026-HB07; MINES-29: 50/50 mutations killed by their named check |
| MINES-30 (package) | PASS | 11 declared-limitation rows, the load-bearing premises with "Could the data contradict it?", every exhibit E01…E08 listed by file name |

### False-alarm rates

Pass 1 has four screens, each held to α/4 = 0.0025: uniformity (Bonferroni over 340 tests), lag-1 and runs (4 tests each),
and the RTP cells, whose exact binomial false-alarm rates sum to 0.0018 over the 2,722 scored cells — so MINES-20 as a
whole is at most 1 %. Pass 2, the scored per-slot standardised rule over the 9,682 played slots of every revealed seed:
0.00989 ± 0.000221; the pooled rule scored until 14 Oct on the 8,500 Phase A slots: 0.00789 ± 0.000198
(`src/false-alarm-pass2.ts`, `npm run false-alarm:pass2`, 200,000 replicates each). All under the 1 % cap for a failing step.

### Observations (not scored)

- **24-hour rule.** The round left open on purpose on 12 Oct 2026 (grid 25, 1 mine, 1 tile open, value 0.020625) was still
  active at the capture's checks 24.009 h, 24.579 h and 25.027 h after it was left, and was finished by the server at
  2026-10-13T14:54:22.654857Z, 25 h 8 m 42 s after its last decision: cashed out at exactly its value, and the bet history
  shows it won with that payout (E07). Its payout is scored in MINES-11 and its bet-history row in MINES-16, so a
  settlement that broke the rule would move the verdict. The rule says 24 hours and the close came 1 h 8 m 42 s later; no
  MINES check covers the timing or the unwitnessed "with none" branch, so those are reported as observed.
- **Cash-out with no tile open**, sent on purpose twice on 12 Oct: refused both times, HTTP 400 code 6 "open a tile before
  cashing out", as E02 rulesMinesCashout says.
- **One round re-sent by the capture** (12 Oct, round `089c2078…`, DL-9): the capture re-sent the bet's own generation id
  with 50 actions (49 reveals and a cash-out); every one was answered with the bet answer itself, nothing opened and no
  second round. A second bet sent while that round was open was refused, HTTP 409 code 17 "finish the round you are playing
  first". The round was then finished by one reveal and is counted in the reconciliation (MINES-16).

### Framework S5 matrix and offline checks

S5 level: the framework's fairness-integrity matrix.

<!-- S5-MATRIX:BEGIN -->
| Test ID | Category | What the framework tests | Result | Tied to |
|---|---|---|---|---|
| S5-1 | Replay protection | A completed bet ID cannot be replayed to duplicate a payout | Not tested | The row's control, the replay of a completed bet, was exercised by no test of the report. Observed on another case, which does not close the row: HB-MINES-REPLAY-001: two identical bet requests were sent in parallel: one was accepted and debited and the duplicate was refused while the first was in flight; no request was re-sent after its round had settled. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no replay of a completed round was sent. Observed only: the 50 actions the capture re-sent with an open round's own generation id were each answered with the bet answer, nothing opened and no second round (observation above, DL-9); every captured round settled once, with one payout (MINES-11, MINES-16). DL-11 |
| S5-2 | Input validation | Invalid, out-of-range or malformed parameters are rejected | Pass (a finding in HB-MINES-SEED-001 was fixed by HouseBets and re-tested) | HB-MINES-PARAM-001, HB-MINES-SEED-001: Out-of-range, fractional, omitted and wrong-type mine counts were rejected; client seeds longer than 60 characters and a whitespace-only seed were refused. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: the capture sent only valid boards, tiles and stakes. Observed only: an empty client seed, sent once on purpose, was refused, HTTP 400 (E06). DL-11 |
| S5-3 | Seed integrity under adversarial input | Server and client seed fields cannot be injected or overridden via the API | Pass | HB-MINES-MAXWIN-002: A bet carrying injected nonce, payout, multiplier, value, board and seed fields was rejected at validation and nothing was reflected; the control bet settled as published and recomputed from the revealed seed. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no injection was attempted. Observed only: every server answer of a round carries its pair's committed hash and client seed (MINES-03), and the 4 player-set Phase D seeds are the ones the fields recompute with (MINES-06). DL-11 |
| S5-4 | Cross-player isolation | One player's seeds, nonces or outcomes are not observable or influenced by another | Pass on 1 of 2 controls; 1 not tested (findings in HB-MINES-AUTH-001 and HB-MINES-AUTH-002 were fixed by HouseBets and re-tested) | HB-MINES-AUTH-001, HB-MINES-AUTH-002: Bets carrying foreign and malformed user identifiers were rejected, and every reveal and cash-out a second account sent against an open round of the first was refused; the round stayed intact and the second account's balance did not move. Not covered: observation by another account was not tested. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: single test account (EC-9). DL-11 |
| S5-5 | Payout field integrity | Client-supplied payout or multiplier values are ignored by the server | Pass | HB-MINES-MAXWIN-002: A bet carrying injected nonce, payout, multiplier, value, board and seed fields was rejected at validation and nothing was reflected; the control bet settled as published and recomputed from the revealed seed. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: the capture never sent a payout or multiplier field. Observed only: every payout equals the stake × the formula multiplier, rounded down to 1e-8 (MINES-11, MINES-13). DL-11 |
| S5-6 | Nonce sequence enforcement | Nonces cannot be forced, replayed or skipped via the API | Pass | HB-MINES-NONCE-001, HB-MINES-NONCE-002, HB-MINES-NONCE-003, HB-MINES-NONCE-004, HB-MINES-MAXWIN-002: Bets carrying reused, skipped-ahead, zero, negative and overflow-sized nonces, or an injected nonce field, were rejected at validation and only the control and recovery bets advanced the nonce. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no nonce was supplied by the client. Observed only: nonces run 1..50 with no gap, repeat or reorder in every 13 Oct pair, and each round's nonce is the server's count before it + 1 on 9,600/9,600 rounds (MINES-04). DL-11 |
| S5-7 | Parameter boundary enforcement | Bet amounts, configuration values and game parameters outside valid ranges are rejected | Pass | HB-MINES-PARAM-001, HB-MINES-PARAM-003, HB-MINES-MAXWIN-001: Out-of-range mine counts, a bet one mine over the maximum, and over-limit, sub-floor, over-precise and negative stakes were rejected. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no out-of-range board, mine count, tile or stake was sent. Observed only: no captured round came near the max win, so the max-win stop was never reached (MINES-14, DL-10). DL-11 |
| S5-8 | Game-specific state | For Mines: revealing the same tile twice, cashing out after a loss | Pass | HB-MINES-RACE-002, HB-MINES-RACE-003: Identical reveals of one tile sent in parallel applied once and the rest were refused; where a reveal sent together with a cash-out hit a mine, the cash-out was refused and nothing was paid. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: neither was attempted. Observed only: a cash-out with no tile open, sent on purpose twice, was refused both times, HTTP 400 code 6, and a second bet sent while a round was open was refused, HTTP 409 code 17 (observations above); every bust ends on exactly one derived mine and pays 0 (MINES-10). DL-11 |
<!-- S5-MATRIX:END -->

Of the eight framework rows, **6 pass on every control the row names**, **1 passes on part of the controls it names** (S5-4:
the row's status says how many of its controls were tested, and its evidence cell what was not) and **1 remains Not
tested** (S5-1: no test replayed a completed bet). In two of the passing rows a finding was fixed by HouseBets and re-tested. The passing rows rest on
fairness-integrity tests run separately on HouseBets' running service by ProvablyFair.org; they are recorded in the
ProvablyFair.org report for this game, Section 5 (Fairness Integrity Testing), not in this package's data, so nothing in
this package reproduces them. The matrix names 14 of that section's 29 tests: 13 under the row whose control they test and one (HB-MINES-REPLAY-001)
under S5-1 as an observation on another case; the
other 15 tests check controls outside these eight rows (4 of them recorded there as fixed by HouseBets) and are in the
report only. This package's own capture recorded normal play, two deliberate negative tests (an empty client seed; a
cash-out with no tile open) and one round its own fault re-sent; it sent no other adversarial request. The "Observed only"
notes state what the captured data shows; none substitutes for the adversarial test, and reproducing a test from this
package needs a deliberate probe capture (DL-11).

The nine offline consistency checks are this audit's own ids, not the framework's S5 rows:

| Check | Category | What was tested | Result | Finding |
|---|---|---|---|---|
| EC-1 | Commitment integrity | Seed substitution: can a revealed seed be swapped for a better one that still matches the commitment? | Pass | 202/202 seeds hash to their commitments and every chain links in order from a pre-capture anchor; these are consistency checks, the timing rests on the capture's reads before each pair (P-1). MINES-01, MINES-02 |
| EC-2 | Player influence | Client-seed manipulation: does the client seed enter the derivation? | Pass | 8,494/8,500 fields change under a wrong client seed (6 identical, 5.35 expected by chance, mostly 1-mine boards); Phase D 200/200 recompute under player-set seeds and 200/200 differ from the previous seed's fields. MINES-06 |
| EC-3 | Payout integrity | Stake-conditional outcome: do the captured higher-stake rounds recompute and settle by the same rule as the base stake? | Pass | 150 rounds at 2.00 and 150 at 10.00 recompute and pay by the same rule as 0.02; the derivation takes no stake input. MINES-12 |
| EC-4 | Commitment integrity | Server-seed cherry-picking: can the operator pre-select seeds unfavourable for the early nonces? | Pass | Structural for a client seed the player sets after the hash is shown, as the capture did on 198 of 202 pairs (P-1); the 4 Phase D client seeds were chosen before the capture (DL-1), so the structural argument does not cover those pairs, which are in the Pass 2 screen; who generates HouseBets' default client seed was not checked. Statistical: Pass 2 over all 202 revealed seeds × 10,000 nonces, scored per-slot standardised return z 0.495, p 0.6897; power 2.15 pp per round spread over all slots; a deficit confined to the 988 slots at 10× or more is not detectable by the scored statistic (148.5 pp needed; 47.5 pp for a separate, unscored test on those slots alone) (DL-6). MINES-21, MINES-06 |
| EC-5 | Seed lifecycle | Seed-rotation race: can a rotation during an open round change its seed? | Not tested | Every round's settled fairness block carries the pair it was opened under (MINES-03), but no rotation was sent while a round was open |
| EC-6 | Payout integrity | Multiplier tampering: is any win, step or offer at a multiplier other than the published formula's? | Pass | Recomputed from (N, m, k) alone and compared with the served multiplier: 4,907/4,907 settles, 1,118/1,118 steps, 1,779/1,779 offers shown before a tile; payouts exact. MINES-13, MINES-11, MINES-17 |
| EC-7 | Nonce integrity | Nonce manipulation: are nonces skipped, reused or reordered? | Pass | Every pair of the 13 Oct phases (A 170/170, C 3/3, C $10 3/3, D 4/4, E 12/12) runs exactly 1..50 with the server's count equal to 50; every server answer of a round carries the same nonce. MINES-04 |
| EC-8 | RNG integrity | Range-mapping bias: does the draw-to-tile map favour some tiles? | Pass | Counted over the 2^32 inputs from the two ends of each outcome's interval (the ends checked through the function; the values between them are not enumerated) for every range 2 … 64: worst deviation 2.2827 × 10^-10. MINES-08 |
| EC-9 | Scope limitation | Multi-account seed sharing | Not tested | Single test account |

## Player verifiers

The ProvablyFair.org verifier for HouseBets is at
[provablyfair.org/verify-bets/housebets](https://www.provablyfair.org/verify-bets/housebets). The module it runs for this
game ships in this release as `site-verifier/derive.js`, sha256
`e50f0c82ff03a1f56140d9a9b0dda0dcb1621b112126bf4c5f24792168e54adf`. The live verifier serves exactly these bytes.

**How the module is built.** `npm run build:site-verifier` (`scripts/build-site-verifier.mjs`, bun 1.3.9) bundles
`src/rng.ts` into one ES module with no import, which exports the same functions under the same names (`drawStream`,
`hmacBlock`, `picks`, `positionFromU`, `sha256Hex`) and runs in a browser and in Node. `src/rng.ts` takes SHA-256 and
HMAC-SHA256 from Node; a browser page has no such module, so the build puts its own implementation of the two inside the
file. Nothing else differs from `src/rng.ts`. The same sources give the same bytes: the file's header carries the sha256 of
`src/rng.ts` and no date, host or path, the bun version is fixed, and `node scripts/release-manifest.mjs --check` rebuilds
the module in a throwaway folder and requires the shipped file to equal the rebuild byte for byte.

**What MINES-24 checks, on every run.** The file on disk has the sha256 pinned in `src/artifact-pins.ts`
(`SITE_VERIFIER_PIN`) and in RELEASE-MANIFEST.json, and this document and the README quote it. The module is then loaded
from that file and run side by side with `src/rng.ts` on every round MINES-07 replays, with the seed, client seed, nonce,
grid size and mine count of each round: 9,681 rounds of the six shipped datasets (the 9,600 of the 13 Oct phases and the
81 rounds of the 12 Oct file settled in their own record; the one 12 Oct round split over two records, which MINES-07 does
not replay, is not replayed here either, DL-9) and 202 revealed seeds, 38,926 calls over its five functions, 0 differing
results. Two mutations cover the check (`tests/mutations.json`): M24a changes the position formula inside the module
(u × n to u × (n − 1)) and re-pins it everywhere, so only the side-by-side run can catch it; M24b breaks the pin and leaves
the module alone. To confirm the bytes a page serves, compare the sha256 of the module it loads with the one above.

HouseBets' own verify tab was not tested (DL-4).

## Reproduce the audit

`node verify.js` on Node 22, or `npm test` on Node 22.6 or later, with nothing installed. Re-generation of the artifacts of record:
`npm run simulate` (the census, `outputs/simulation-results.json`), `npm run rtp-claim:write` (the RTP table),
`npm run record` (the verification record) — each re-pinned in `src/artifact-pins.ts` (and `src/rtp-settings.ts`) in the
same change, then `npm run build:site-verifier` (rebuilds `site-verifier/derive.js` from `src/rng.ts` and writes its pin) and
`npm run build:standalone` (verify.js; MINES-27 refuses a bundle built from other sources, and a stale `verify.js` itself exits 4 with no verdict). `npm run
mutate` runs the mutation battery in throwaway copies and writes the committed record `outputs/mutation-results.json`;
`npm run gate:fresh` runs the package from a fresh copy and writes `outputs/fresh-copy.json`; `npm run release-manifest`
then pins both in RELEASE-MANIFEST.json (MINES-28/29 read only those pinned records); RELEASE-MANIFEST.json pins every
file of the package except itself. `npm run false-alarm:pass2`
re-derives both Pass 2 false-alarm declarations.

A release-gate record that is missing or is not the bytes RELEASE-MANIFEST.json pins fails the verdict (exit 1), and every
mutant copy reads the fresh-copy record, so the records are regenerated in this order: `npm run build:standalone`,
`npm run gate:fresh`, `npm run release-manifest`, `npm run mutate`, `npm run release-manifest`. MINES-24 reads the module's
pin from RELEASE-MANIFEST.json, so after a change of `src/rng.ts` these come first: `npm run build:site-verifier`,
`npm run release-manifest`.

`verify.js` is bundled by bun; the version that built it is written into its header and recorded in RELEASE-MANIFEST.json
as `toolchain.bun`. `node scripts/release-manifest.mjs --check` recomputes the manifest from the files on disk, rebuilds
`site-verifier/derive.js` from `src/rng.ts` (bun 1.3.9) and requires the shipped file to equal the rebuild, and prints
OK or STALE; on STALE it names the files that differ, and when `verify.js` is one of them it names the bun version that built
the release's bundle, the one that built the bundle on disk and this machine's. Another bun version can bundle the same
sources to different bytes (local names) with the same results, so a STALE that names only `verify.js` after a local rebuild
is that toolchain difference: compare the `VERDICT:` and `Reproduction` lines of `node verify.js` on both. `scripts/make-evidence.py` rebuilds `evidence/` from the HouseBets
workshop.

Exit codes of `node verify.js` / `npm run verify`, the same in all 11 HouseBets new-engine packages (the ranking of
RTP-CLAIM 1.2.0, `rtpClaimVerdict`): 0 PROVABLY FAIR — Full Pass · 2 PROVABLY FAIR — Conditional Pass · 5 RTP FIGURE
OVERSTATED · 3 INCOMPLETE · 1 NOT PROVABLY FAIR · 4 `verify.js` is a stale build of the sources beside it (no verdict). When
more than one applies: NOT PROVABLY FAIR > INCOMPLETE > RTP FIGURE OVERSTATED > Conditional Pass > Full Pass.

## Evidence

| exhibit | file | role |
|---|---|---|
| E01 | `evidence/E01-mines-fairness-spec-2026-10-13.json` | the server's published mines spec (derivation, tile numbering, rules, multiplier, return claim, five worked boards, eight worked payouts) |
| E02 | `evidence/E02-mines-rules-panel-2026-10-10.json` | the game page's rules panel text, cut from the bundle the live mines page loaded (checked 10 Oct 2026), with the bundle's hash |
| E03 | `evidence/E03-mines-limits-2026-10-13.json` | the limits answer: wallet minimum stake 0.01000311, max win 1,000,310.0961298 USDT, 8 decimals |
| E04 | `evidence/E04-mines-bet-history-2026-10-13.json` | the platform's bet-history rows of the 9,600 scored 13 Oct rounds |
| E05 | `evidence/E05-account-reconcile-2026-10-13.txt` | the whole account's reconciliation, the full output of `python3 -I reconcile-full.py --ledger ledger/ledger-2026-10-13-final.json --before 986.84718000` (ends RECONCILED), re-run 13 Oct: 86,979 history entries = 86,966 captured rounds of the 11 games + 13 earlier bets, wallet exact, a row per dataset |
| E06 | `evidence/E06-mines-empty-seed-control-2026-10-13.json` | the server's answer to an empty client seed: refused, HTTP 400 |
| E07 | `evidence/E07-mines-abandoned-round-2026-10-13.json` | the round left open on 12 Oct, the capture's checks, the server's record of finishing it and its bet-history row |
| E08 | `evidence/E08-mines-rules-panel-live-2026-10-19.json` | the same rules panel text in the live copy of the game page's bundle, fetched 19 Oct 2026 (last-modified Fri, 16 Oct 2026 09:18:09 GMT, sha256 and etag recorded), with every key changed since E02 (the RTP template reworded; Min bet / Max bet lines replace the bet-range line) |

**Capture code (`capture/`, reference copy).** `capture-hb-mines.reference.mjs` (the game's capture script), `multistep-common.reference.mjs`
and `hb-capture-lib.reference.mjs` (the modules it imports) and `crypto-shim.reference.js` (the browser stand-in for
`node:crypto` the in-tab capture ran with). Comments are redacted for publication (names, quotes and internal paths
removed); the code is unchanged. The as-run game script, sha256 `4bf69ed028f2dd7e8787b7e4af8bf6105ee194e2e79f4d414ee620bd4ebcd330`, the value every 13 Oct
dataset records as `meta.captureScript.sha256`, is held privately; the shipped copy is not that file. The 12 Oct file
records the version of the script used on 12 Oct (`993615d1…`), whose copy was not kept. No hash of the three other files was recorded at
capture, so their as-run copies are not identified. The copies are pinned in RELEASE-MANIFEST.json.

`scripts/make-evidence.py` records the source path and sha256 of each exhibit; `scripts/make-live-rules.py` builds E08 from the
live bundle copy of 19 Oct and stops unless its reading reproduces every key of E02 from the 10 Oct copy.

## Limitations and trust

### Load-bearing premises

| ID | Premise | Why it holds | Could the data contradict it? |
|---|---|---|---|
| P-1 | Each commitment was shown before its rounds. On the 198 of 202 pairs whose client seed the capture drew (every pair outside Phase D), the seed was drawn after the commitment was read; the 4 Phase D client seeds were chosen before the capture (DL-1), and each of their commitments was read before the pair's first round | The capture read the hash, then drew the seed, then played; read and draw times are logged per pair (188/188 in order, MINES-06; the seed generator is the capture's own label, MINES-06, DL-1) | Partly: a commitment that did not match its revealed seed would fail MINES-01; the order of reads is the capture's record, not the server's |
| P-2 | E02 is the text players see | The bundle E02 was cut from is the one the live mines page loaded, checked 10 Oct 2026; E08 is the same URL's copy of 19 Oct (that the live page still loads it was not re-checked) | No: the rendered panel was not captured; a different panel would not show in the data |
| P-3 | The served `multiplier` field is the nearest binary64 to the exact fraction | Measured on every settle and step (MINES-13); the published text gives the fraction | Yes: one value at another rounding would fail MINES-13 |
| P-4 | The account was used only by the capture | E05: the history holds the captured rounds and 13 earlier bets, nothing else | Yes: any other bet would be an unexplained history entry |

### Declared limitations register

| ID | Limitation | Effect | Closure / evidence |
|---|---|---|---|
| DL-1 | Phase D client seeds are predictable strings chosen by the auditor (`provablyfair-1`, `provablyfair-2`, `player-seed-abc`, `1234567890`) | All 4 Phase D pairs are exposed to an operator who could foresee them; Phase D tests recomputation, not unpredictability; Pass 2 replays them with every other revealed seed (MINES-21) | Phases A, C, C $10 and E client seeds are labelled by the capture as `node:crypto randomBytes(16) hex` (188/188); the check is a label match. A redacted reference copy of the capture code is in `capture/` (the client seed is `csprngClientSeed` in `hb-capture-lib.reference.mjs`: a prefix and `randomBytes(16)` in hex, in the browser `window.crypto.getRandomValues`, `crypto-shim.reference.js`); the as-run game script is held privately, so the shipped copy shows the code, not proof of what ran ([Evidence](#evidence)) |
| DL-2 | Commitment timing rests on the capture's reads (P-1) | Hash equality is a consistency check | — |
| DL-3 | The per-round balance field cannot be checked round to round: the games were captured concurrently | Reconciliation uses the platform history (E04) and the account reconciliation (E05) instead | E05 RECONCILED; each package file's totals match its row |
| DL-4 | The player-facing reveal path and the hashed server seed were observed in the API and the game's code, not on the rendered verify screen | README "Verify a bet" steps 1 and 2 are scoped to that: they name the API fields, not a place on the screen | — |
| DL-5 | Pass 1 scores the 2,722 RTP cells with at least 30 expected surviving rounds; the 1,400 deeper cells (a million rounds rarely or never survive that deep) are printed, not scored. All 1,400 of them fall inside the band (MINES-20) | Their exact RTP is still 99 % by the table (MINES-19); scoring them would raise the false-alarm rate past the cap (2.94 summed over all 4,122 cells, MINES-20) | Threshold fixed from the false-alarm computation before any cell statistic was computed, as the builder states (`src/sim-config.ts`); no artifact records that order |
| DL-6 | Pass 2's scored statistic is, since 14 Oct, the per-slot standardised return of the played slots, and since 27 Oct its population is every played slot of every revealed seed (9,682 slots on 202 seeds), as the profile's -21 rule asks; until then it was the 8,500 Phase A slots. Both changes were made AFTER the earlier result was known: the switch from the pooled return after the pooled result, the widening after the Phase A result. All three are printed and all pass (standardised over every seed z 0.495, p 0.6897; Phase A alone z −0.096; pooled Phase A z −0.042, p 0.4834). A uniform deficit is detectable at 2.15 pp per round; a deficit confined to the 988 slots whose multiplier is 10× or more is not detectable by the scored statistic (it would take 148.5 pp per round on those slots, more than a round can lose); a separate test on those slots alone would detect 47.5 pp per round | The subset's own standardised z (−0.776) is printed in MINES-21, not scored | Of the 9,682 rounds Pass 2 covers, 9,681 are recomputed in full by MINES-07/11; the one 12 Oct round recorded over two records by a resumed finish is in Pass 2 but is not replayed (DL-9) |
| DL-7 | The 24-hour rule was observed on one round, the "tiles open" branch; the "no tile open" branch was not exercised, and the close came 25 h 8 m 42 s after the last decision | The witnessed settlement's payout is scored (MINES-11) and its bet-history row (MINES-16); the timing and the unwitnessed branch are an observation (no MINES check covers the rule itself; ROAD-31 and HILO-32 score the same rule, PASS with the unwitnessed branch declared) | E07 |
| DL-8 | The free round (stake 0, E02 rulesMinesFreeRound) was not played | Not in scope | — |
| DL-9 | The 12 Oct capture file is played on pairs of 10 before the Phase A design, so it is not part of the population or pair-structure checks (MINES-02, 04's pair rule, 05). Its 81 records that hold a whole round (the two negative tests and the 24 h round included) are recomputed round by round. One round, split over two records by a resumed finish after a refused re-bet, is not replayed. Why it split is a fault of our capture rig, not the operator: in its first record (round 089c2078…, grid 49, 48 mines) every one of the 51 requests re-sent the bet's own `generation` id, so the server answered each of the 50 actions (49 reveals and a cash-out) with the bet answer again (`seq` 0, nothing opened); the second record is a re-bet refused with HTTP 409 and one reveal that settled the round | That round is counted in the file's reconciliation row (E05: 82 rounds; MINES-16 recomputes the row's totals from the server's settled round records) | — |
| DL-10 | No captured round came near the max win: 0 of the 11,459 request answers of the replayed rounds offered a max-win stop | The max-win branch is declared, not measured; the rule is checked only as "the next tile is offered" on 1,118 steps. MINES-14 passes with the branch declared: its rule asks for monotone multipliers within the declared cap, which hold, and an unexercised branch is not one of its violations | — |
| DL-11 | This package's capture sent no adversarial request to the API, so its data cannot reproduce a fairness-integrity test | The tests behind the S5 matrix were run separately on HouseBets' running service by ProvablyFair.org and are recorded in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity Testing), not in this package: 7 of 8 rows Pass on them (6 on every control the row names, 1 on part), 1 remains Not tested (S5-1, where the test sent a duplicate in parallel and not the replay of a completed bet); single test account. The two deliberate negative tests (an empty client seed, E06; a cash-out with no tile open, twice) and the round the capture re-sent are noted under S5-1, S5-2 and S5-8, and close no row | The S5 matrix under [Verification results](#verification-results) names the tests behind each row and states what the captured data shows. Reproducing a test from this package needs a deliberate probe capture |

## Terms

**G-BIND:** the framework's population rule (MINES-05): the counts a dataset is checked against are code constants in
`src/loader.ts`, never the dataset's own header.

## Release history

**`v1.0.0`**: first public release, 24 Nov 2026. Verdict PROVABLY FAIR — Full Pass.

E05, the account's reconciliation, also lists 13 bets of 10 October 2026, placed before the capture; they are in no dataset
of this package.
