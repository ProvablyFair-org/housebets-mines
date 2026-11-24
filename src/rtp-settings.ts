// RTP-CLAIM wiring — HouseBets mines: the per-setting exact RTP table and the claim it is held to.
// The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (conformance C-13 compares the
// SHA-256), version 1.2.0. The switch src/rtp-claim-switch.ts is ON (Methodology v1.1, 14 Oct 2026): the -19 check is
// scored; a house-side miss is OVERSTATED and the verdict RTP FIGURE OVERSTATED (exit 5), never NOT PROVABLY FAIR.
//
// SETTINGS. Every way a player can cash out: every grid (25, 36, 49, 64), every mine count 1 … N − 1 and every number of safe
// tiles k = 1 … N − m (E01 rules): 4,122 settings. Which tiles are opened does not matter on a uniform board.
// EXACT RTP. P(k tiles safe) = C(N − m, k) / C(N, k) × the multiplier 99·C(N, k) / (100·C(N − m, k)) (E01 "multiplier";
// MINES-13: every winning round of the capture) — computed as the product of the two fractions, in exact integers.
// CLAIM. Read at run time from the pinned exhibits, never from a constant: every place the evidence
// states the return as a figure (src/exhibits.ts rtpPlaces), held to the highest of them. The source names each place and
// says how it was read: in the game's code and answers, not on a rendered page. Not scored here: the payout's truncation to
// the wallet's 1e-8 unit (E01 rules), which depends on the stake (MANIFEST.md#payouts-and-rtp states its size).
//   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RtpClaimAccumulator, rtpClaimTable, rtpClaimGate } from './rtp-claim';
import type { RtpClaim, RtpClaimResult, RtpClaimGate } from './rtp-claim';
import { multFrac, survivalComb } from './rules.ts';
import { GRIDS } from './spec.ts';
import { publishedRtp } from './exhibits.ts';
import { ROOT } from './loader.ts';

/** The claim, built from the exhibits (pin-checked by MINES-26 before verify calls this). */
export function rtpClaim(): RtpClaim {
  const pub = publishedRtp(); const [e01, e02, e08] = pub.places;
  return {
    kind: 'flat',
    rtp: pub.rtp,
    source: `HouseBets mines, stated in three places, each read in the game's code or answers, none on a rendered page (P-2): `
      + `in the game settings the site loads — the fairness answer, ${e01.where}: "${e01.text}", requested by the live game bundle `
      + `(platform-housegames-mines2-game.js sha256 e8e5d68ff2536c4e…, the file E02 cites: qt("/"+Qe+"/fairness") then setFairnessSpec); `
      + `and in the rules — the game page rules panel in that bundle, ${e02.where}: "${e02.text}" (its {pct} and rulesMinesRTP `
      + `"The return is exactly {pct}% at every cash-out point, for every board and every mine count." are filled at run time, `
      + `not captured rendered); and, since HouseBets reworded rulesMinesRTP on 16 Oct, in the live copy of that bundle, ${e08.where}: "${e08.text}" `
      + `(E08). Held to the highest figure stated: ${pub.places.map((p) => `${p.place} ${p.rtp}`).join(', ')}${pub.agree ? ' (they agree)' : ' (THEY DISAGREE)'}.`,
  };
}
export const RTP_CLAIM_TABLE = join(ROOT, 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = '377075a84cbb856125d56d80f83a71985145ad9a095c4b786d73797bb91ed0cc';

export function computeRtpClaim(): RtpClaimResult {
  const acc = new RtpClaimAccumulator(rtpClaim());
  for (const N of GRIDS) for (let m = 1; m < N; m++) for (let k = 1; k <= N - m; k++) {
    const [a, b] = multFrac(N, m, k), [c, d] = survivalComb(N, m, k);
    acc.add(`grid ${N} · ${m} mines · ${k} tiles`, a * c, b * d, `grid ${N}`);
  }
  return acc.result();
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'housebets/mines', game: 'mines',
    settingSpace: 'every grid (25, 36, 49, 64), mine count 1 … N − 1 and cash-out depth k = 1 … N − m (4,122 settings)',
    rtpMethod: 'exact rational: C(N−m,k)/C(N,k) × 99·C(N,k)/(100·C(N−m,k)), the settled multiplier',
  });
}

export function runRtpClaimGate(): RtpClaimGate {
  const r = computeRtpClaim();
  return rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
}

if (process.argv[1] && /rtp-settings\.ts$/.test(process.argv[1])) {
  const text = rtpClaimTableText(computeRtpClaim());
  writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
