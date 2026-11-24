// The game as HouseBets publishes it — the only source of every declared number this package holds the data to.
//   E01  GET /housegames/mines2/fairness, answered to the capture 13 Oct 2026 15:00Z (RNG, tile numbering, grids, rules,
//        multiplier, return, 5 worked boards, 8 worked payouts)
//   E02  the mines game page's rules panel, in the bundle the live page loads (platform-housegames-mines2-game.js,
//        checked on the live page 10 Oct 2026)
//   E03  GET /housegames/limits/mines2 (min bet, max bet, max win, wallet decimals)
// Nothing here is read from the captured rounds.

/** E01 "grids": [25, 36, 49, 64]; rules[0] "a board of 25, 36, 49 or 64 tiles with 1 to N − 1 mines". */
export const GRIDS = [25, 36, 49, 64] as const;
/** Every (grid, mine count) a player can choose: 24 + 35 + 48 + 63 = 170 boards. */
export const BOARDS: readonly (readonly [number, number])[] = GRIDS.flatMap((N) => Array.from({ length: N - 1 }, (_, i) => [N, i + 1] as const));

// The published return has no constant here: src/exhibits.ts reads it from E01 "return" and E02 at run
// time and src/rtp-settings.ts builds the RTP-CLAIM claim from it.

/** E01 rules (verbatim). */
export const RULES = [
  'a board of 25, 36, 49 or 64 tiles with 1 to N − 1 mines; the mines are fixed by the seed pair and the nonce before the first tile is opened',
  'a mine ends the round and pays nothing',
  'after at least one safe tile the round can be cashed out; opening the last safe tile cashes it out by itself',
  'a bet may name its tiles: they are opened in order and a round that meets no mine is cashed out at once',
  'a round never pays more than its max win above the stake: a tile that would take the cash-out value past it is not opened',
  "a payout is rounded down to the wallet's smallest unit (1e-8) once",
  'a round left without a decision for 24 hours is finished by the server: with tiles open it is cashed out at its value; with none, tile 0 is opened and, if it is safe, the round is cashed out',
] as const;
export const MULTIPLIER_TEXT = 'after k safe tiles on N tiles with m mines a stake is paid × 99/100 × C(N, k) / C(N − m, k)';
export const TILE_NUMBERING = 'Tiles are numbered 0 to N − 1 from left to right, top to bottom.';

/** E03 wallet.minBet: the platform minimum stake in the audited wallet (USDT). Phase A stakes 0.02 (above it). MINES-26 asserts
 *  at run time that it equals E03. */
export const MIN_STAKE = '0.01000311';
export const PHASE_A_STAKE = '0.02';
/** E03 wallet.maxWin: the round's max win above its stake, USDT. MINES-26 asserts at run time that it equals E03. */
export const MAX_WIN = '1000310.0961298';
export const WALLET_DECIMALS = 8;

/** E01 "examples": the published worked boards (field in draw order). */
export const SPEC_BOARDS = [
  { serverSeed: 'housebets-demo-server-seed-0001', clientSeed: 'demo-client', nonce: 1, grid: 25, mines: 3, field: [17, 4, 9] },
  { serverSeed: 'housebets-demo-server-seed-0001', clientSeed: 'demo-client', nonce: 2, grid: 25, mines: 24, field: [20, 21, 23, 22, 8, 14, 7, 1, 19, 11, 5, 10, 13, 6, 9, 15, 18, 0, 2, 4, 24, 12, 16, 17] },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, grid: 36, mines: 5, field: [22, 9, 7, 16, 20] },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 7, grid: 49, mines: 10, field: [47, 40, 8, 19, 22, 11, 39, 16, 48, 1] },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, grid: 64, mines: 1, field: [40] },
] as const;
/** E01 "payouts": the published worked multipliers (exact fractions) and payouts per unit stake. */
export const SPEC_PAYOUTS = [
  { grid: 25, mines: 1, opened: 1, multiplier: '33/32', payout: '1.03125' },
  { grid: 25, mines: 3, opened: 1, multiplier: '9/8', payout: '1.125' },
  { grid: 25, mines: 3, opened: 2, multiplier: '9/7', payout: '1.28571428' },
  { grid: 25, mines: 24, opened: 1, multiplier: '99/4', payout: '24.75' },
  { grid: 25, mines: 12, opened: 13, multiplier: '5148297/1', payout: '5148297' },
  { grid: 36, mines: 5, opened: 4, multiplier: '166617/89900', payout: '1.85335928' },
  { grid: 49, mines: 48, opened: 1, multiplier: '4851/100', payout: '48.51' },
  { grid: 64, mines: 63, opened: 1, multiplier: '1584/25', payout: '63.36' },
] as const;

/** The commitment encoding: sha256 of the server seed's UTF-8 text, lowercase hex (MINES-01). */
export const COMMITMENT_ENCODING = 'sha256(utf8(serverSeed)) as lowercase hex';
