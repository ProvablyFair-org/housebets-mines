// The MINES profile's 30 checks (id, name, layer, kind, policy), generated from the framework's public profile games/mines/profile.public.json
// (profileVersion 1.0.3-public, framework 1.1, sha256 fb425fc9dd186d21d6dfa347d5c5d420a09b30172fbb10b0b05a21910a2e5439) by tools/gen-profile-map.mjs. Regenerate rather than edit.
// The framework file itself ships as profile/profile.json; tests/verify.ts checks its sha256 against
// PROFILE_SHA256 and these rows against it at run time, and takes the scored list and the policies from it.
export type Policy = 'HARD_FAIL' | 'FLAG' | 'INFORMATIONAL' | 'GRADED' | 'RELEASE_GATE';
export interface ProfileCheck { id: string; name: string; layer: string; kind: 'verifier-step' | 'package-check'; policy: Policy }
export const PROFILE_SHA256 = 'fb425fc9dd186d21d6dfa347d5c5d420a09b30172fbb10b0b05a21910a2e5439';
export const PROFILE_VERSION = "1.0.3-public";
export const PROFILE: readonly ProfileCheck[] = [
  { id: "MINES-01", name: "Seed hash integrity", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-02", name: "Forward commitment chain", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-03", name: "Hash consistency within epoch", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-04", name: "Nonce continuity", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-05", name: "Population & epoch size (G-BIND)", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-06", name: "Client-seed influence & Phase D recomputation", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-07", name: "Outcome recomputation", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-08", name: "Draw bias bound", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-09", name: "RNG reference vectors", layer: "S2", kind: "package-check", policy: "GRADED" },
  { id: "MINES-10", name: "Win condition & reveal-sequence consistency", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-11", name: "Payout arithmetic", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-12", name: "Bet-size invariance (Phase C)", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-13", name: "Multiplier formula & provenance", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-14", name: "Multiplier monotonicity & bounds", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "MINES-15", name: "Configuration & depth coverage", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "MINES-16", name: "Wallet / balance reconciliation", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "MINES-17", name: "Multi-reveal parity", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-18", name: "Anti-circularity (win probability)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-19", name: "Effective edge per cell vs claim", layer: "S4", kind: "verifier-step", policy: "FLAG" },
  { id: "MINES-20", name: "Simulation Pass 1 (fresh seeds)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-21", name: "Simulation Pass 2 (cherry-pick)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-22", name: "Live-sample fit", layer: "S4", kind: "verifier-step", policy: "INFORMATIONAL" },
  { id: "MINES-23", name: "S5 fairness-integrity matrix", layer: "S5", kind: "package-check", policy: "GRADED" },
  { id: "MINES-24", name: "Player-verifier parity", layer: "S6", kind: "package-check", policy: "GRADED" },
  { id: "MINES-25", name: "Player check path documented", layer: "S6", kind: "package-check", policy: "GRADED" },
  { id: "MINES-26", name: "Dataset & config pins", layer: "S7", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-27", name: "Artifacts of record", layer: "S7", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "MINES-28", name: "Fresh-clone reproduction", layer: "S7", kind: "package-check", policy: "RELEASE_GATE" },
  { id: "MINES-29", name: "Mutation battery", layer: "S7", kind: "package-check", policy: "GRADED" },
  { id: "MINES-30", name: "Disclosure register & evidence appendix", layer: "S7", kind: "package-check", policy: "GRADED" },
];
