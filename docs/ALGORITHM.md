# HouseBets Mines: algorithm specification

Written 21 Oct 2026 for the ProvablyFair.org audit of HouseBets House Games **Mines** on the engine HouseBets serves since
October 2026 (API slug `mines2`, fairness version `canonical`).

HouseBets publishes this game's algorithm. This document restates it as one implementable specification and records,
for every step, where it comes from and what the capture measured. It is not a clean-room reconstruction: the steps are
the ones HouseBets publishes, and every formula below is the one this package computes (`src/rng.ts`, `src/rules.ts`).
Every step names its source:

- **PAGE**: HouseBets' own published text. E01 is the server's fairness answer, `GET /housegames/mines2/fairness`
  (`evidence/E01-mines-fairness-spec-2026-10-13.json`, read 13 Oct 2026). E02 is the rules panel of the game page bundle
  of 10 Oct 2026 (`evidence/E02-mines-rules-panel-2026-10-10.json`). E08 is the same panel in the live bundle of 16 Oct 2026
  (`evidence/E08-mines-rules-panel-live-2026-10-19.json`). E03 holds the wallet limits.
- **CODE**: this package's implementation of the step, `src/rng.ts` or `src/rules.ts`.
- **DATA**: the scored check of `node verify.js` that holds the step against the captured rounds (MINES-xx). The capture
  is 9,600 rounds of 13 Oct 2026 (phases A, C, C $10, D, E) and the 81 whole-round records of 12 Oct 2026; see
  [MANIFEST.md](../MANIFEST.md#dataset-and-capture).

---

## 1. Inputs and commitment

### 1.1 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | text string, secret until the pair is rotated; 64 lowercase hex characters in every captured pair | PAGE: E01 `derivation` ("key = serverSeed"). DATA: 202 revealed seeds (MINES-01) |
| `clientSeed` | text string set by the player | PAGE: E01 `derivation`. DATA: the capture's seeds are 39 or 44 characters (198 pairs); Phase D used four short auditor-typed seeds (MINES-06) |
| `nonce` | integer ≥ 1; 1 on the first round of a fresh pair, +1 per round | DATA: nonces exactly 1…50 in every pair, and each round's nonce = the server's count before it + 1 on 9,600 / 9,600 rounds (MINES-04) |
| `N` | board size: 25, 36, 49 or 64 tiles | PAGE: E01 `grids` |
| `m` | number of mines, 1 … N − 1 | PAGE: E01 `rules[0]` |
| `stake` | decimal on the wallet's 1e-8 grid | PAGE: E01 `rules[5]`; E03 limits |
| opened tiles | ordered, distinct tiles chosen by the player, or named up front in an auto bet | PAGE: E01 `rules[3]` |

Tiles are numbered **0 to N − 1 from left to right, top to bottom** (PAGE: E01 `tiles`).

### 1.2 Commitment

```
commitment = lowercase_hex( SHA-256( UTF-8(serverSeed) ) )
```

i.e. the hash of the seed's text, not of the bytes its hex would decode to.

- SOURCE: CODE `sha256Hex` (`src/rng.ts`); `src/spec.ts` `COMMITMENT_ENCODING`.
- DATA: 202 / 202 revealed seeds hash to the commitment shown before their rounds (MINES-01). Each pair also shows the hash
  of the next seed, and every chain of the 13 Oct phases links (MINES-02). Every server answer of a round carries the same
  hash, client seed and version as the settled block the recompute uses (MINES-03).

---

## 2. Mine field derivation

### Step 1: HMAC blocks

```
block(b) = HMAC-SHA256( key = UTF-8(serverSeed), message = UTF-8(clientSeed + ":" + dec(nonce) + ":" + dec(b)) )
stream   = block(0) ‖ block(1) ‖ block(2) ‖ …
```

`dec(x)` is plain base 10. The key is the seed's text, the same bytes the commitment hashes.

- SOURCE: PAGE E01 `derivation` ("block_i = HMAC_SHA256(key = serverSeed, message = clientSeed:nonce:i)"); CODE
  `hmacBlock` (`src/rng.ts`).

### Step 2: 32-bit draws

```
u(i) = bytes 4i .. 4i+3 of stream, read as an unsigned 32-bit BIG-ENDIAN integer       (i = 0, 1, 2, …)
```

Each block yields 8 draws; draw 8 starts block 1.

- SOURCE: PAGE E01 `derivation` ("bytes 4i..4i+3 of block_0 ‖ block_1 ‖ … read as a big-endian number u"); CODE
  `drawStream` (`src/rng.ts`).

### Step 3: pick from the tiles left

```
left = [0, 1, …, N − 1]                       # kept in ascending order
for i in 0 … m − 1:
    pos  = floor( u(i) × (N − i) / 2^32 )      # 0 ≤ pos < N − i
    mine[i] = left[pos];  remove left[pos]
field = mine[0 .. m − 1]                       # IN THIS ORDER: the order the server's `field` lists them
```

- SOURCE: PAGE E01 `derivation` ("the tile at position floor(u × (N − i) / 2^32) among the tiles not yet picked, kept in
  ascending order … A board with m mines is the first m picks"); CODE `positionFromU`, `picks` (`src/rng.ts`).
- The arithmetic is exact in binary64: `u × n < 2^38` and the division is by a power of two.
- E01 also states the map as `floor(float × (N − i))` with `float = Σ byte_j / 256^(j+1)` over the same four bytes. The
  two forms are the same number.
- DATA: the derived field equals the served `field` **in draw order** on Phase A 8,500 / 8,500, C 150 / 150, C $10
  150 / 150, D 200 / 200, E 600 / 600 and 12 Oct 81 / 81 (MINES-07). The five boards E01 works recompute (MINES-09).
- The field depends only on (serverSeed, clientSeed, nonce, N, m). It takes no stake input (MINES-12) and does not
  depend on the tiles the player opens: the mine set is invariant through every tile-by-tile round, 600 / 600 (MINES-17).

### Bias of the map

There is no modulo step and no rejection. For every range n = 2 … 64 that the four boards use, the map
`u ↦ floor(u × n / 2^32)` is monotone and its counts over all 2^32 values of `u` sum to 2^32; for n = 25 every position gets
171798691 or 171798692 values. The worst deviation of a position's probability from 1/n is 2.2827 × 10^-10 (n = 51), below
the profile's 2^-32 = 2.3283 × 10^-10 ceiling (MINES-08, a count from the two ends of each position's interval of `positionFromU`, not an enumeration).

---

## 3. Win condition and payout

### 3.1 Win condition

Let `opened = [p₁, …, p_k]` be the tiles opened, in order.

```
loss ⇔ some pₜ ∈ field; the round ends on that tile and pays 0
win  ⇔ no pₜ ∈ field after k ≥ 1 safe tiles, and the round is cashed out
```

- A round can be cashed out only after at least one safe tile; opening the last safe tile cashes it out by itself; tiles
  named up front in a bet are opened in order and a round that meets no mine is cashed out at once (PAGE: E01 `rules[1]`
  to `rules[3]`).
- DATA: win ⇔ no opened tile is a derived mine, and a bust ends on exactly one derived mine, decided from the recomputed
  field and never the outcome label: 9,681 / 9,681 rounds (MINES-10).

### 3.2 Multiplier

```
multiplier(N, m, k) = 99/100 × C(N, k) / C(N − m, k)
```

computed as the exact fraction `[99 · C(N, k), 100 · C(N − m, k)]`.

- SOURCE: PAGE E01 `multiplier` ("× 99/100 × C(N, k) / C(N − m, k)"), E02 `rulesMinesFormula` ("0.99 ×"); CODE
  `MULT_NUM`, `MULT_DEN`, `multFrac` (`src/rules.ts`).
- The served `multiplier` field is that fraction's nearest binary64 (round half to even; CODE `fracToDouble`,
  `multDouble`). DATA: every winning settle 4,907 / 4,907 and every open rung of a stepped round 1,118 / 1,118; E01's 8 worked
  fractions 8 / 8 (MINES-13).
- Before every tile the game offers the next tile's multiplier and value (`next`); both equal the formula at the next
  depth on 1,779 / 1,779 answers (MINES-17).

### 3.3 Payout

```
win : payout = floor( stake × 99 · C(N, k) / (100 · C(N − m, k)) , 8 decimals )     # rounded down once, exact integers
loss: payout = 0
```

- SOURCE: PAGE E01 `rules[5]` ("a payout is rounded down to the wallet's smallest unit (1e-8) once"); CODE `pay8`
  (`src/rules.ts`), on integer 1e-8 units (`units8`).
- DATA: exact on 9,680 / 9,680 rounds that settled by a decision, and every amount the server sent is on the 1e-8 grid,
  9,681 / 9,681 rounds (MINES-11).

### 3.4 Win probability and return

```
P(k tiles all safe) = C(N − m, k) / C(N, k) = Π_{i=0}^{k−1} (N − m − i) / (N − i)
RTP(N, m, k)        = P × multiplier = 99/100        (before the 1e-8 floor)
```

- P is the count with every mine layout equally likely. The map of §2 is within 2^-32 of equal at each pick, not exactly
  equal (MINES-08); that difference is not carried into P or into the RTP.
- SOURCE: PAGE E01 `return` ("99% for every board and every number of tiles opened: C(N − m, k) / C(N, k) is the chance
  that k tiles are all safe"); CODE `survivalComb`, `survivalProduct` (`src/rules.ts`).
- DATA: the two forms of P agree in exact integers on all 4,122 (grid, mines, tiles) cells (MINES-18); the derived RTP is
  99/100 in every one of the 4,122 cells (MINES-19, `outputs/rtp-claim-table.json`). The 1e-8 floor costs a 0.02 stake at
  most 4.69 × 10^-7 of RTP (grid 64, 1 mine, 2 tiles; see [MANIFEST.md](../MANIFEST.md#payouts-and-rtp)).

### 3.5 Max win

```
tile k is allowed  ⇔  maxWin ≤ 0  or  payout(k) − stake ≤ maxWin
```

A tile that would take the cash-out value past the round's max win above the stake is not opened.

- SOURCE: PAGE E01 `rules[4]`; CODE `allowed` (`src/rules.ts`); `maxWin` 1000310.0961298 USDT, E03 wallet
  (`src/spec.ts` `MAX_WIN`, held equal to E03 by MINES-26).
- DATA: every settled win is within it, 9,681 / 9,681, and the next-tile offer follows the rule on every open step,
  1,118 / 1,118; no captured round came near the cap, so the stop branch itself is unwitnessed (MINES-14 passes with it
  declared; DL-10).

### 3.6 Idle rounds

A round left without a decision for 24 hours is finished by the server: with tiles open it is cashed out at its value;
with none, tile 0 is opened and, if it is safe, the round is cashed out (PAGE: E01 `rules[6]`; E02 `rulesMinesIdle`).
DATA: one round, the "tiles open" branch, was closed 25 h 8 m 42 s after its last decision and paid exactly its value
(MINES-11, MINES-16); the "no tile open" branch was not exercised (DL-7).

### 3.7 Fields an implementation must not read

`field`, `hit`, `outcome`, `multiplier`, `value`, `next`, `payout` are the operator's claims, to be checked. The
derivation reads only `serverSeed`, `clientSeed`, `nonce`, `grid`, `mines`, the stake and the opened tiles in order.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Inputs: server seed, client seed, nonce, grid, mines | PAGE | E01 `derivation`, `grids`, `rules[0]` |
| Nonce starts at 1, +1 per round | DATA | 9,600 / 9,600 (MINES-04) |
| Commitment SHA-256 of the seed's UTF-8 text, hex | CODE + DATA | 202 / 202 (MINES-01) |
| Next-hash chain | DATA | every 13 Oct chain links (MINES-02) |
| HMAC-SHA256, key = seed text, message `clientSeed:nonce:b` | PAGE + CODE | E01 `derivation` |
| u = 4 bytes big-endian, blocks concatenated | PAGE + CODE | E01 `derivation` |
| pick `floor(u × (N − i) / 2^32)` among the tiles left, ascending | PAGE + CODE + DATA | field in draw order on every round (MINES-07); E01 boards (MINES-09) |
| No rejection; bias ≤ 2^-32 | CODE + DATA | full census, worst 2.2827 × 10^-10 (MINES-08) |
| Win ⇔ no opened mine | PAGE + DATA | 9,681 / 9,681 (MINES-10) |
| multiplier = 99/100 × C(N, k) / C(N − m, k), served as nearest binary64 | PAGE + CODE + DATA | 4,907 / 4,907 settles, 1,118 / 1,118 rungs (MINES-13) |
| payout = floor8(stake × multiplier), exact | PAGE + CODE + DATA | 9,680 / 9,680 (MINES-11) |
| RTP 99/100 in every cell | PAGE + CODE | 4,122 cells (MINES-18, MINES-19) |
| Max win stop | PAGE + CODE | declared, not reached (MINES-14, DL-10) |

---

## 5. Test vectors

Computed on 21 Oct 2026 with this package's own `src/rng.ts` and `src/rules.ts` (§7). "block 0" is `block(0)`, "u(0)" its
first four bytes, "pos(0)" the first pick's position among the N tiles.

**V1: E01's published boards** (PAGE, E01 `examples`; the derived field equals the published one on all five)
```
serverSeed housebets-demo-server-seed-0001  clientSeed demo-client  nonce 1  N 25  m 3   → field 17 4 9
serverSeed housebets-demo-server-seed-0001  clientSeed demo-client  nonce 2  N 25  m 24  → field 20 21 23 22 8 14 7 1 19 11 5 10 13 6 9 15 18 0 2 4 24 12 16 17
serverSeed 5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a  clientSeed housebets  nonce 1  N 36  m 5   → field 22 9 7 16 20
serverSeed 5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a  clientSeed housebets  nonce 7  N 49  m 10  → field 47 40 8 19 22 11 39 16 48 1
serverSeed 5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a  clientSeed housebets  nonce 1  N 64  m 1   → field 40
```

**V2: E01's published payouts** (PAGE, E01 `payouts`, stake 1; `multFrac` unreduced, equal to the published fraction)
```
N 25 m 1  k 1   2475/2400        = 33/32        payout 1.03125
N 25 m 3  k 1   2475/2200        = 9/8          payout 1.125
N 25 m 3  k 2   29700/23100      = 9/7          payout 1.28571428
N 25 m 24 k 1   2475/100         = 99/4         payout 24.75
N 25 m 12 k 13  514829700/100    = 5148297      payout 5148297
N 36 m 5  k 4   5831595/3146500  = 166617/89900 payout 1.85335928
N 49 m 48 k 1   4851/100                        payout 48.51
N 64 m 63 k 1   6336/100         = 1584/25      payout 63.36
```

**V3: round `b42e1a84-4ee6-4a65-b21e-2de338a06597`** (Phase A, first round, auto bet naming tile 19, win)
```
serverSeed  f7992ebda863e093934521e71b908ce6faf6446a8207479afa634084a0c84be5
commitment  ddc689eb3d11a1b8e91024cab42585d9020a3dc40d0fe92fb453d217b6b72ed1   (= the hash shown before the round)
clientSeed  pfminesstartf44263ebb003eae7ec4131c20b0413ba   nonce 1   N 49   m 22   stake 0.02
block 0     197dde02ab07cf507c8110d01ccaa5d51829aae73a0fd25f9195f40bd1798f7b   u(0) 427679234 → pos(0) 4
field       4 33 23 6 5 12 29 41 34 45 15 31 9 14 11 39 8 3 46 26 1 0   (= served, same order)
opened [19] → safe → win, k 1   multiplier 4851/2700 = 1.7966666666666666 (served 1.7966666666666666)
payout      floor8(0.02 × 4851/2700) = 0.03593333 (served 0.03593333)
```

**V4: round `64614a27-90e1-40d4-87a6-887552cac4cc`** (Phase A, N 25, m 3, win)
```
serverSeed  bed6b3beeab580632d470fd11eada199bc5068088503e6e5cc136415e28ab531
commitment  84203205c104b075185f1b5c897479a4769186fc112d8b52386c62c4e90095c6
clientSeed  pfmines29962fceb3ebf97820a8b7cb23b0595e   nonce 28   N 25   m 3   stake 0.02
block 0     356e052c91025bd9e8f2abe537f1d3c6baa615425713e0d9edcaa9397c17c5cb   u(0) 896402732 → pos(0) 5
field       5 14 22   (= served)
opened [9] → win, k 1   multiplier 9/8 = 1.125   payout 0.0225 (served 0.0225)
```

**V5: round `d6b9257f-d6f3-47b1-b71f-b5de5fedd285`** (Phase A, N 64, m 63, auto bet naming tile 13, loss)
```
serverSeed  b4ff1bc50670922d01efb8855b08a298d8fcca255fa225adee201a68743507e0
commitment  0cb8eabf4b2ba40e13857d8464df22d9624aee01ae1f7b89be3f9fbfef26b677
clientSeed  pfmines7cb28db48ed337751523c5a9438b06f9   nonce 21   N 64   m 63   stake 0.02
block 0     c4abf8860dd98eeaf60283cae5e6603518397973770e7b4166c297095db73651   u(0) 3299604614 → pos(0) 49
field       49 3 61 56 6 29 25 22 11 23 38 34 51 46 4 55 5 13 59 52 62 32 57 35 8 60 12 41 28 47 63 16 58 19 26 24 7 21 27
            2 10 14 44 0 37 54 17 39 40 18 1 48 50 36 53 43 33 15 30 45 9 42 31   (= served, 63 tiles; tile 20 is the safe one)
tile 13 is a mine → loss   payout 0 (served 0)
```

**V6: round `96d055fe-57ef-43a9-b7e3-ccd020b0b0a2`** (Phase E, played tile by tile, N 64, m 13, four tiles)
```
serverSeed  9dae4d99d8bd1a8feda488c77a3f72c0f5838586fcfd7e42ebcd6d1edfd0586c
commitment  ab261da4aeea310aedb5261d306281b4a13b1ff0d366bdecdb95ce4fd30d166f
clientSeed  pfminesstart2b7f2676c19eae0c0325d1a67a9c79cd   nonce 2   N 64   m 13   stake 0.02
block 0     e7182dfeb58795cd4a79bc01192336356f851910b508bcaa6f1bd6c190482510   u(0) 3877121534 → pos(0) 57
field       57 44 18 5 28 45 27 36 19 20 9 16 43   (= served)
opened 29 1 55 48 → all safe → cash out, k 4
multiplier  62902224/24990000 = 2.517095798319328 (served 2.517095798319328)
payout      0.05034191 (served 0.05034191)
```

---

## 6. Open points

- **O1: the rendered verify screen.** The reveal path (the rotation answer carries the previous server seed) was observed
  in the API and the game's code, not on the rendered verify screen (DL-4).
- **O2: max win.** The cap is declared (E01 `rules[4]`, E03) and the next-tile offer follows it on every step, but no
  captured round came near it (MINES-14, declared; DL-10).
- **O3: idle rounds.** The 24-hour rule was observed once, on the "tiles open" branch; the "no tile open" branch (tile 0
  opened) was not exercised, and nothing measures the 24-hour timing beyond that one close (DL-7).
- **O4: free rounds.** The free round (stake 0, E02 `rulesMinesFreeRound`) was not played (DL-8).
- **O5: client-seed encoding beyond ASCII.** UTF-8 is what the code uses; every captured client seed is ASCII.

---

## 7. Reproduction of the vectors

From the package directory, Node 22: the vectors in §5 are the output of `picks`, `hmacBlock`, `sha256Hex`,
`positionFromU` (`src/rng.ts`) and `multFrac`, `pay8`, `multDouble` (`src/rules.ts`) on the inputs shown, with the served
values read from the round's settled answer in `data/`. `npm test` recomputes every captured round the same way
(MINES-07, MINES-11, MINES-13); `node verify.js` is the same suite as one file.

## 8. Sources

E01, E02, E03 and E08 in `evidence/`; this package's `src/rng.ts`, `src/rules.ts`, `src/spec.ts`; the scored record
`outputs/verification-results.json`; the datasets in `data/` (V3–V6). HouseBets' own game code was not used to write
this document.
