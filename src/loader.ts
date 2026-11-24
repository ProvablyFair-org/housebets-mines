// Dataset pins and the population of record, stated as CODE next to the pin (a dataset that agrees with its own header
// proves nothing; the scored steps compare against these constants, never meta).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Dataset } from './types.ts';

/** The package root: the nearest folder above this module holding package.json "housebets-mines-audit" (works from src/
 *  under Node and from the bundled verify.js at the root). */
function findRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = join(d, 'package.json');
    if (existsSync(p) && /"name":\s*"housebets-mines-audit"/.test(readFileSync(p, 'utf8'))) return d;
    d = dirname(d);
  }
  throw new Error('package root not found');
}
export const ROOT = findRoot();
export const DATA = join(ROOT, 'data');

// Phase A primary: 8,500 single-tile auto rounds, 170 seed pairs of exactly 50 (13 Oct 2026 15:00–18:15 UTC)
export const PRIMARY_FILE = 'housebets-mines-phaseA-auto1-8500rounds.json';
export const PRIMARY_SHA256 = '9dad19c845c17c2ccae3604f7be607cfecef4e918ffbe3ca9e8965c72de4c791';
// Supplementary phases (13 Oct 2026), each its own dataset
export const PHASE_C_FILE = 'supplementary/housebets-mines-phaseC-elevated-150rounds.json';
export const PHASE_C_SHA256 = '19a6332806364ea4e7eda3bc99bd637a4192f57aab07982ff760a2719e21b57c';
export const PHASE_C10_FILE = 'supplementary/housebets-mines-phaseC-elevated-10usd-150rounds.json';
export const PHASE_C10_SHA256 = '7443b8837146d70fc2bdece7f03f5d0c8605ba352e29b1d7394a5a358eec33c5';
export const PHASE_D_FILE = 'supplementary/housebets-mines-phaseD-playerseeds-200rounds.json';
export const PHASE_D_SHA256 = 'd71f53cfd882669a59c7585a39f8040c9afcf3d4970510886df96bbf7c33ad1a';
export const PHASE_E_FILE = 'supplementary/housebets-mines-phaseE-multistep-600rounds.json';
export const PHASE_E_SHA256 = '705e537a16cb2ca9ce1119ef65c8dcaca1d28d7c620d7d258241b7e309bdbd34';
// The 12 Oct 2026 capture file that holds the round left open on purpose and the server's close of it 24 h+ later. Its rounds
// settled inside their own record are recomputed one by one; it is never counted as a population (MINES-05).
export const H24_FILE = 'supplementary/housebets-mines-full-83rounds-withopen.json';
export const H24_SHA256 = '318711cfd81fa261c1f229ac6441999e5e9b988fd0217fc4157dcc7012176126';
/** Every dataset of the package with the label the verifier prints for it. Pass 2 (MINES-21) replays every revealed seed of
 *  every one of them. */
export const ALL_DATASETS: readonly (readonly [string, string])[] = [['A', PRIMARY_FILE], ['C', PHASE_C_FILE], ['C $10', PHASE_C10_FILE],
  ['D', PHASE_D_FILE], ['E', PHASE_E_FILE], ['12 Oct', H24_FILE]];

/** Evidence exhibits the steps read and the ones MANIFEST cites (all pinned, scripts/make-evidence.py). */
export const EVIDENCE_PINS: readonly (readonly [string, string])[] = [
  ['evidence/E01-mines-fairness-spec-2026-10-13.json', '712c8facf206368d0ae1858221da3f7ebb2004981ae95264d3b9f6483e6ad06a'],
  ['evidence/E02-mines-rules-panel-2026-10-10.json', '60879dfe3287cbf335d4e5f73d13b4d99891cb859db09bdb7e8c348efa99084c'],
  ['evidence/E03-mines-limits-2026-10-13.json', '07f13a2f91dd27dc1b0718f29b4a0cda2cb1f82a1b0ea20560575f45bdc2fb63'],
  ['evidence/E04-mines-bet-history-2026-10-13.json', '0b7ba07c136209afd9628db9d880c2d8a689ec95774de69c6fa671dccfa86c80'],
  ['evidence/E05-account-reconcile-2026-10-13.txt', 'a10834e35226d1b1b03cf50e431b442f4321ee2076a80796aaf6a32898991812'],
  ['evidence/E06-mines-empty-seed-control-2026-10-13.json', 'f590a7fb556705b12275dd2262c9e358ff71d549d4213b1b47fc9dca19a34fd3'],
  ['evidence/E07-mines-abandoned-round-2026-10-13.json', 'ec8706ebc89d7d753a2ecd379ff790cea4f9eb8110b2082442a0579aa7137dcf'],
  ['evidence/E08-mines-rules-panel-live-2026-10-19.json', 'df4ee545c39228eecb9537c298e38f771baf2935a7ec679b9422d75de998e6dd'],
];

// The population of record
export const EXPECTED_ROUNDS = 8500;
export const EXPECTED_SEEDS = 170;
export const EXPECTED_EPOCHS = 170;
export const EXPECTED_EPOCH_SIZE = 50;
export const EXPECTED_PHASE_C_ROUNDS = 150;     // 3 epochs × 50, grid 25, 1 mine, one auto tile, stake 2.00 (100 × the Phase A stake 0.02)
export const EXPECTED_PHASE_C10_ROUNDS = 150;   // 3 epochs × 50, same config, stake 10 (the $10 set)
export const EXPECTED_PHASE_D_ROUNDS = 200;     // 4 epochs × 50, one player-set client seed per epoch
export const EXPECTED_PHASE_E_ROUNDS = 600;     // 12 epochs × 50, tile-by-tile rounds
export const PHASE_A_STAKE = '0.02';
export const PHASE_C_STAKE = '2';
export const PHASE_C10_STAKE = '10';
export const PHASE_C_BOARD = [25, 1] as const;
export const PHASE_D_SEEDS = ['provablyfair-1', 'provablyfair-2', 'player-seed-abc', '1234567890'] as const;
export const NONCE_BASE = 1;   // HouseBets nonces start at 1 on a fresh pair (every epoch of the capture)
/** Phase A capture plan: every one of the 170 (grid, mine count) boards, 50 single-tile rounds each. */
export const PLAN_ROUNDS_PER_BOARD = 50;
export const PLAN_BOARD_FLOOR = 50;   // MINES-15: Phase A ≥ 50 bets per configuration

export const sha256Bytes = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
export const sha256File = (rel: string): string => sha256Bytes(readFileSync(join(ROOT, rel.startsWith('evidence/') || rel.startsWith('outputs/') ? rel : join('data', rel))));
export const load = (rel: string): Dataset => JSON.parse(readFileSync(join(DATA, rel), 'utf8')) as Dataset;
export const readJson = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
