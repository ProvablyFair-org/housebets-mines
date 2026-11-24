// MINES-09 RNG reference vectors: the worked examples of HouseBets' own published mines spec (E01, GET
// /housegames/mines2/fairness, 13 Oct 2026) and one captured round of the primary dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picks } from '../src/rng.ts';
import { multFrac, multDouble, pay8, units8 } from '../src/rules.ts';
import { SPEC_BOARDS, SPEC_PAYOUTS } from '../src/spec.ts';

for (const b of SPEC_BOARDS) test(`spec board ${b.clientSeed}:${b.nonce} grid ${b.grid} mines ${b.mines}`, () => assert.deepEqual(picks(b.serverSeed, b.clientSeed, b.nonce, b.grid, b.mines), [...b.field]));
for (const p of SPEC_PAYOUTS) test(`spec payout grid ${p.grid} · ${p.mines} mines · ${p.opened} tiles = ${p.multiplier}`, () => {
  const [a, b] = multFrac(p.grid, p.mines, p.opened); const [n, d] = p.multiplier.split('/').map(BigInt);
  assert.equal(a * d, b * n);
  assert.equal(pay8(100000000n, p.grid, p.mines, p.opened), units8(p.payout));
});
// Phase A round idx 0 (epoch 0, nonce 1): grid 49, 22 mines, tile 19 opened, cashed out at ×1.7966666666666666, payout 0.03593333
test('Phase A round 0: field, served multiplier and payout recompute', () => {
  const field = picks('f7992ebda863e093934521e71b908ce6faf6446a8207479afa634084a0c84be5', 'pfminesstartf44263ebb003eae7ec4131c20b0413ba', 1, 49, 22);
  assert.deepEqual(field, [4, 33, 23, 6, 5, 12, 29, 41, 34, 45, 15, 31, 9, 14, 11, 39, 8, 3, 46, 26, 1, 0]);
  assert.ok(!field.includes(19));
  assert.equal(multDouble(49, 22, 1), 1.7966666666666666);
  assert.equal(pay8(units8(0.02), 49, 22, 1), units8(0.03593333));
});
