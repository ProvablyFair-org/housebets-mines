# Module interface the audit package uses (written by the auditor, not from the casino)

`src/rng.ts` and `src/rules.ts` (TypeScript, strict, Node `crypto` only, no dependencies) export exactly these names; the
round replay (`src/replay.ts`) and `tests/verify.ts` take the game's algorithm from them. The simulation (`src/simulate.ts`)
carries one faster form of the same draw, `tileIsMine`, built on `positionFromU`, which stops as soon as the tile it asks
about is drawn.
Semantics come from [ALGORITHM.md](ALGORITHM.md); this file only fixes names, types and the package's own conventions.
Tiles are numbered 0..N − 1 as HouseBets numbers them (E01 `tiles`). Amounts are bigint 1e-8 units.

```ts
// src/rng.ts
// One HMAC-SHA256 block: key = serverSeed as UTF-8, message = `${clientSeed}:${nonce}:${block}`.
export function hmacBlock(serverSeed: string, clientSeed: string, nonce: number, block: number): Buffer;
// The map from a 32-bit draw u to a position among n remaining tiles: floor(u · n / 2^32). MINES-08 censuses it.
export const positionFromU: (u: number, n: number) => number;
// The round's 32-bit big-endian draws, block after block (8 per block).
export function drawStream(serverSeed: string, clientSeed: string, nonce: number): Generator<number>;
// The first m picks on N tiles, IN DRAW ORDER (= the order the server's `field` lists them).
export function picks(serverSeed: string, clientSeed: string, nonce: number, N: number, m: number): number[];
// The commitment: SHA-256 of the seed's UTF-8 text, lowercase hex.
export const sha256Hex: (s: string) => string;

// src/rules.ts
export const comb: (n: number, k: number) => bigint;                                // C(n, k), 0 outside 0..n
export const MULT_NUM: bigint, MULT_DEN: bigint;                                     // 99n, 100n
export const multFrac: (N: number, m: number, k: number) => [bigint, bigint];       // [99·C(N,k), 100·C(N−m,k)]
export const pay8: (stake8: bigint, N: number, m: number, k: number) => bigint;    // floor(stake × multiplier), 1e-8 units
export function fracToDouble(num: bigint, den: bigint): number;                    // nearest binary64, half to even
export const multDouble: (N: number, m: number, k: number) => number;              // the served `multiplier`
export function units8(x: number | string): bigint;                                 // a JSON decimal to 1e-8 units
export const allowed: (stake8: bigint, cap8: bigint | null, N: number, m: number, k: number) => boolean;   // max-win rule
export const survivalComb: (N: number, m: number, k: number) => [bigint, bigint];   // [C(N−m,k), C(N,k)]
export function survivalProduct(N: number, m: number, k: number): [bigint, bigint]; // Π(N−m−i) / Π(N−i)
```
The verdict never reads an operator field to decide an outcome: `field`, `outcome`, `multiplier` and `payout` are compared
with these functions' results, never used as inputs.
