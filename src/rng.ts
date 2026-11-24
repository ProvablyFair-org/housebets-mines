// HouseBets House Games mines (new engine, fairness version "canonical"), derived from the published spec only
// (GET /housegames/mines2/fairness, E01; the same text the game's rules panel carries, E02):
//   block_i = HMAC_SHA256(key = serverSeed as UTF-8, message = `${clientSeed}:${nonce}:${i}`)
//   mine i (i = 0, 1, …) = bytes 4i..4i+3 of block_0 ‖ block_1 ‖ … read as a big-endian number u; it is the tile at position
//   floor(u × (N − i) / 2^32) among the tiles not yet picked, kept in ascending order. A board with m mines is the first m
//   picks, IN DRAW ORDER (the order the server's `field` lists them).
// Everything is integer arithmetic: u × n < 2^38 and the division is by a power of two, exact in binary64.
import { createHmac, createHash } from 'node:crypto';

export function hmacBlock(serverSeed: string, clientSeed: string, nonce: number, block: number): Buffer {
  return createHmac('sha256', Buffer.from(serverSeed, 'utf8')).update(`${clientSeed}:${nonce}:${block}`).digest();
}

/** The declared map from the 32-bit draw u to a position among n remaining tiles: floor(u · n / 2^32). MINES-08 censuses
 *  this function for every range n the game uses. */
export const positionFromU = (u: number, n: number): number => Math.floor((u * n) / 4294967296);

/** A stream of the round's 32-bit draws, block after block. */
export function* drawStream(serverSeed: string, clientSeed: string, nonce: number): Generator<number> {
  for (let b = 0; ; b++) { const d = hmacBlock(serverSeed, clientSeed, nonce, b); for (let o = 0; o < 32; o += 4) yield d.readUInt32BE(o); }
}

/** The first m picks on N tiles, in draw order. */
export function picks(serverSeed: string, clientSeed: string, nonce: number, N: number, m: number): number[] {
  const left: number[] = Array.from({ length: N }, (_, i) => i); const out: number[] = [];
  const it = drawStream(serverSeed, clientSeed, nonce);
  for (let i = 0; i < m; i++) out.push(left.splice(positionFromU(it.next().value as number, N - i), 1)[0]);
  return out;
}

export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
