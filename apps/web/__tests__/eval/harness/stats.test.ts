import { describe, expect, it } from "vitest";
import {
  bootstrapPassRate,
  cohensKappa,
  holmAdjust,
  mcnemarExact,
  mulberry32,
  pairedBootstrapDelta,
  pairedMde,
  summarizeComparison,
  wilcoxonSignedRank,
  type CaseSamples,
  type PairedCase,
} from "@/__tests__/eval/harness/stats";

describe("mcnemarExact golden values", () => {
  /**
   * Two-sided exact binomial sign test: p = 2 * sum_{i=0}^{min(b,c)} C(n,i) / 2^n.
   * Each expected value below is worked by hand from that definition, not read
   * off this implementation.
   */

  it("matches the hand-computed value for b=10, c=2", () => {
    // n = 12, min = 2. C(12,0)+C(12,1)+C(12,2) = 1 + 12 + 66 = 79.
    // 79 / 2^12 = 79 / 4096 = 0.019287109375; doubled = 0.03857421875.
    const result = mcnemarExact({ b: 10, c: 2 });
    expect(result.pValue).toBeCloseTo(0.038_574_218_75, 10);
    expect(result.discordant).toBe(12);
  });

  it("matches the hand-computed value for b=15, c=5", () => {
    // n = 20, min = 5. C(20,0..5) = 1 + 20 + 190 + 1140 + 4845 + 15504 = 21700.
    // 21700 / 2^20 = 21700 / 1048576 = 0.0206947326660156; doubled = 0.0413894653320312.
    const result = mcnemarExact({ b: 15, c: 5 });
    expect(result.pValue).toBeCloseTo(0.041_389_465_332_031_2, 10);
  });

  it("caps the doubled tail at 1 for b=1, c=1", () => {
    // n = 2, min = 1. (C(2,0)+C(2,1)) / 4 = 3/4; doubled = 1.5, capped to 1.
    expect(mcnemarExact({ b: 1, c: 1 }).pValue).toBe(1);
  });

  it("matches the hand-computed value for b=23, c=8", () => {
    // n = 31, min = 8. Sum C(31,0..8)
    //   = 1 + 31 + 465 + 4495 + 31465 + 169911 + 736281 + 2629575 + 7888725
    //   = 11460949.
    // Doubled: 11460949 / 2^30 = 11460949 / 1073741824 = 0.0106738405302167.
    const result = mcnemarExact({ b: 23, c: 8 });
    expect(result.pValue).toBeCloseTo(0.010_673_840_530_216_694, 12);
  });

  it("returns p = 1 with no discordant pairs", () => {
    const result = mcnemarExact({ b: 0, c: 0 });
    expect(result.pValue).toBe(1);
    expect(result.discordant).toBe(0);
    expect(result.chiSquareContinuityCorrected).toBe(0);
  });

  it("reports the continuity-corrected chi-square as a cross-check", () => {
    // (|10 - 2| - 1)^2 / 12 = 49 / 12 = 4.0833..., above the df=1 critical
    // value of 3.841, agreeing with the exact p < 0.05.
    expect(
      mcnemarExact({ b: 10, c: 2 }).chiSquareContinuityCorrected,
    ).toBeCloseTo(49 / 12, 10);
  });

  it("is more powerful than the corrected chi-square at these discordant counts", () => {
    // b=13, c=4 (n=17). Sum C(17,0..4) = 1 + 17 + 136 + 680 + 2380 = 3214,
    // so the exact p is 3214 / 2^16 = 0.049042 and rejects at alpha=0.05.
    // The corrected chi-square is (13-4-1)^2 / 17 = 64/17 = 3.7647, BELOW the
    // df=1 critical value of 3.841, so it fails to reject. This is exactly the
    // over-conservatism that makes the approximation miss real improvements.
    const result = mcnemarExact({ b: 13, c: 4 });
    expect(result.pValue).toBeCloseTo(0.049_041_748_046_875, 12);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.chiSquareContinuityCorrected).toBeCloseTo(64 / 17, 10);
    expect(result.chiSquareContinuityCorrected).toBeLessThan(3.841);
  });

  it("is symmetric in b and c", () => {
    for (const [b, c] of [
      [10, 2],
      [15, 5],
      [3, 29],
      [0, 7],
      [18, 18],
    ] as const) {
      expect(mcnemarExact({ b, c }).pValue).toBe(
        mcnemarExact({ b: c, c: b }).pValue,
      );
    }
  });

  it("never exceeds 1 or drops below 0 across a wide grid", () => {
    for (let b = 0; b <= 40; b += 3) {
      for (let c = 0; c <= 40; c += 3) {
        const { pValue } = mcnemarExact({ b, c });
        expect(pValue).toBeGreaterThanOrEqual(0);
        expect(pValue).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shrinks the p-value as the split gets more lopsided", () => {
    const balanced = mcnemarExact({ b: 16, c: 14 }).pValue;
    const skewed = mcnemarExact({ b: 22, c: 8 }).pValue;
    const extreme = mcnemarExact({ b: 28, c: 2 }).pValue;
    expect(skewed).toBeLessThan(balanced);
    expect(extreme).toBeLessThan(skewed);
  });
});

describe("wilcoxonSignedRank", () => {
  /**
   * Data from the worked example in the Wikipedia article "Wilcoxon
   * signed-rank test" (the 10-pair table of before/after measurements).
   *
   * Differences (second minus first):
   *   -15, +7, -5, -20, 0, +9, -17, +12, -5, +10
   * The zero is dropped, leaving n = 9.
   * Sorted magnitudes: 5, 5, 7, 9, 10, 12, 15, 17, 20
   * Ranks:            1.5,1.5, 3,  4,  5,  6,  7,  8,  9
   * Positive deltas (+7, +9, +12, +10) carry ranks 3, 4, 6, 5, so W+ = 18.
   * Negative deltas carry 7 + 1.5 + 9 + 8 + 1.5 = 27, and 18 + 27 = 45 = 9*10/2.
   *
   * The article reports the signed-rank sum (|27 - 18| = 9); this implementation
   * reports W+ = 18 so the direction stays recoverable. Both give the same
   * two-sided p.
   */
  const wikipediaDeltas = [-15, 7, -5, -20, 0, 9, -17, 12, -5, 10];

  it("reproduces the published ranking", () => {
    const result = wilcoxonSignedRank(wikipediaDeltas);
    expect(result.n).toBe(9);
    expect(result.statistic).toBe(18);
  });

  it("matches the hand-computed normal approximation p-value", () => {
    // mean = 9*10/4 = 22.5
    // var  = 9*10*19/24 - (2^3 - 2)/48 = 71.25 - 0.125 = 71.125, sd = 8.433564
    // z    = (|18 - 22.5| - 0.5) / 8.433564 = 4 / 8.433564 = 0.474289
    // p    = 2 * (1 - Phi(0.474289)) = 2 * 0.317645 = 0.635290
    const result = wilcoxonSignedRank(wikipediaDeltas);
    expect(result.pValue).toBeCloseTo(0.635_29, 3);
  });

  it("matches a hand-computed tie-free example", () => {
    // deltas 1..5, all positive: ranks 1..5, W+ = 15, n = 5.
    // mean = 7.5, var = 5*6*11/24 = 13.75, sd = 3.708099
    // z = (7.5 - 0.5) / 3.708099 = 1.887790
    // p = 2 * (1 - Phi(1.88779)) = 2 * 0.029527 = 0.059054
    const result = wilcoxonSignedRank([1, 2, 3, 4, 5]);
    expect(result.n).toBe(5);
    expect(result.statistic).toBe(15);
    expect(result.pValue).toBeCloseTo(0.059_054, 3);
  });

  it("drops zero deltas rather than ranking them", () => {
    expect(wilcoxonSignedRank([0, 0, 0]).n).toBe(0);
    expect(wilcoxonSignedRank([0, 0, 0]).pValue).toBe(1);
    expect(wilcoxonSignedRank([0, 1, 0, 2, 0, 3, 4, 5]).statistic).toBe(15);
  });

  it("keeps direction recoverable from the statistic", () => {
    const positive = wilcoxonSignedRank([1, 2, 3, 4, 5]);
    const negative = wilcoxonSignedRank([-1, -2, -3, -4, -5]);
    const nullMean = (5 * 6) / 4;
    expect(positive.statistic).toBeGreaterThan(nullMean);
    expect(negative.statistic).toBeLessThan(nullMean);
    // Sign flips do not change the two-sided p-value.
    expect(negative.pValue).toBeCloseTo(positive.pValue, 12);
  });

  it("detects a consistent shift that a sign test alone would call marginal", () => {
    const deltas = Array.from({ length: 24 }, (_, i) => (i < 17 ? 0.2 : -0.05));
    const result = wilcoxonSignedRank(deltas);
    expect(result.n).toBe(24);
    expect(result.pValue).toBeLessThan(0.01);
  });
});

describe("holmAdjust", () => {
  it("matches a hand-computed step-down", () => {
    // Raw p sorted: 0.005, 0.011, 0.02, 0.04 with m = 4.
    // scaled: 4*0.005 = 0.020, 3*0.011 = 0.033, 2*0.02 = 0.040, 1*0.04 = 0.040
    // running max is already monotone, so adjusted = [0.02, 0.033, 0.04, 0.04]
    // which maps back to input order as [0.04, 0.02, 0.04, 0.033].
    const adjusted = holmAdjust([0.02, 0.005, 0.04, 0.011]);
    expect(adjusted[0]).toBeCloseTo(0.04, 12);
    expect(adjusted[1]).toBeCloseTo(0.02, 12);
    expect(adjusted[2]).toBeCloseTo(0.04, 12);
    expect(adjusted[3]).toBeCloseTo(0.033, 12);
  });

  it("enforces monotonicity when a later scaled value dips", () => {
    // sorted: 0.01, 0.04 with m = 2. scaled: 0.02, 0.04 -> fine.
    // sorted: 0.03, 0.031 with m = 2. scaled: 0.06, 0.031 -> running max pulls
    // the second up to 0.06.
    const adjusted = holmAdjust([0.03, 0.031]);
    expect(adjusted[0]).toBeCloseTo(0.06, 12);
    expect(adjusted[1]).toBeCloseTo(0.06, 12);
  });

  it("never decreases a p-value and never exceeds 1", () => {
    const random = mulberry32(7);
    for (let trial = 0; trial < 200; trial++) {
      const raw = Array.from({ length: 11 }, () => random());
      const adjusted = holmAdjust(raw);
      for (let i = 0; i < raw.length; i++) {
        expect(adjusted[i] ?? 0).toBeGreaterThanOrEqual((raw[i] ?? 0) - 1e-12);
        expect(adjusted[i] ?? 0).toBeLessThanOrEqual(1);
      }
    }
  });

  it("preserves the ordering of the raw p-values", () => {
    const random = mulberry32(11);
    for (let trial = 0; trial < 100; trial++) {
      const raw = Array.from({ length: 11 }, () => random());
      const adjusted = holmAdjust(raw);
      const order = raw
        .map((_, i) => i)
        .sort((a, b) => (raw[a] ?? 0) - (raw[b] ?? 0));
      for (let rank = 1; rank < order.length; rank++) {
        const previous = adjusted[order[rank - 1] ?? 0] ?? 0;
        const current = adjusted[order[rank] ?? 0] ?? 0;
        expect(current).toBeGreaterThanOrEqual(previous - 1e-12);
      }
    }
  });

  it("leaves a single p-value untouched and handles the empty family", () => {
    expect(holmAdjust([0.03])).toEqual([0.03]);
    expect(holmAdjust([])).toEqual([]);
  });

  it("kills the ablation false positive it exists to prevent", () => {
    // 11 tests, one at 0.03. Uncorrected it "passes"; Holm scales it by 11.
    const raw = [0.03, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
    expect(holmAdjust(raw)[0] ?? 0).toBeGreaterThan(0.05);
  });
});

describe("cohensKappa", () => {
  it("returns 1.0 for perfect agreement", () => {
    const result = cohensKappa({
      bothPass: 70,
      judgePassHumanFail: 0,
      judgeFailHumanPass: 0,
      bothFail: 30,
    });
    expect(result.kappa).toBeCloseTo(1, 12);
    expect(result.observed).toBeCloseTo(1, 12);
    expect(result.n).toBe(100);
  });

  it("returns approximately 0 when agreement is exactly what chance predicts", () => {
    // Judge passes 70%, human passes 70%, independent: cell counts 49/21/21/9.
    // observed = 0.58, expected = 0.7*0.7 + 0.3*0.3 = 0.58, so kappa = 0.
    const result = cohensKappa({
      bothPass: 49,
      judgePassHumanFail: 21,
      judgeFailHumanPass: 21,
      bothFail: 9,
    });
    expect(result.observed).toBeCloseTo(0.58, 12);
    expect(result.expected).toBeCloseTo(0.58, 12);
    expect(result.kappa).toBeCloseTo(0, 12);
  });

  it("exposes a rubber-stamp judge that raw agreement flatters", () => {
    // Judge says pass every time against a 70%-pass human set: 70% raw
    // agreement, zero information.
    const result = cohensKappa({
      bothPass: 70,
      judgePassHumanFail: 30,
      judgeFailHumanPass: 0,
      bothFail: 0,
    });
    expect(result.observed).toBeCloseTo(0.7, 12);
    expect(result.kappa).toBeCloseTo(0, 12);
  });

  it("goes negative when agreement is worse than chance", () => {
    const result = cohensKappa({
      bothPass: 5,
      judgePassHumanFail: 45,
      judgeFailHumanPass: 45,
      bothFail: 5,
    });
    expect(result.kappa).toBeLessThan(0);
  });

  it("matches a hand-computed intermediate value", () => {
    // observed = (45 + 35)/100 = 0.80
    // judge pass = (45 + 15)/100 = 0.60, human pass = (45 + 5)/100 = 0.50
    // expected = 0.6*0.5 + 0.4*0.5 = 0.50
    // kappa = (0.80 - 0.50)/(1 - 0.50) = 0.60
    const result = cohensKappa({
      bothPass: 45,
      judgePassHumanFail: 15,
      judgeFailHumanPass: 5,
      bothFail: 35,
    });
    expect(result.observed).toBeCloseTo(0.8, 12);
    expect(result.expected).toBeCloseTo(0.5, 12);
    expect(result.kappa).toBeCloseTo(0.6, 12);
  });
});

describe("bootstrapPassRate", () => {
  it("is deterministic for a fixed seed and differs across seeds", () => {
    const cases = buildCases({ caseCount: 60, samples: 3, seed: 3, rate: 0.7 });
    const a = bootstrapPassRate({ cases, iterations: 500, seed: 42 });
    const b = bootstrapPassRate({ cases, iterations: 500, seed: 42 });
    expect(a).toEqual(b);

    // Different seeds must exercise a different stream. Individual endpoints
    // can coincide because replicate rates are discrete, so require only that
    // some seed produces a different interval.
    const others = [43, 44, 45, 46].map((seed) =>
      bootstrapPassRate({ cases, iterations: 500, seed }),
    );
    expect(
      others.some(
        (other) => other.lower !== a.lower || other.upper !== a.upper,
      ),
    ).toBe(true);
  });

  it("brackets the point estimate", () => {
    const cases = buildCases({
      caseCount: 120,
      samples: 3,
      seed: 9,
      rate: 0.65,
    });
    const result = bootstrapPassRate({ cases, iterations: 2000, seed: 1 });
    expect(result.lower).toBeLessThanOrEqual(result.estimate);
    expect(result.upper).toBeGreaterThanOrEqual(result.estimate);
    expect(result.caseCount).toBe(120);
  });

  it("collapses to a point interval when every case is identical", () => {
    const cases: CaseSamples[] = Array.from({ length: 50 }, (_, i) => ({
      caseId: `c${i}`,
      passes: [true, true, true],
    }));
    const result = bootstrapPassRate({ cases, iterations: 300, seed: 5 });
    expect(result.estimate).toBe(1);
    expect(result.lower).toBe(1);
    expect(result.upper).toBe(1);
  });

  it("narrows as the case count grows", () => {
    const small = bootstrapPassRate({
      cases: buildCases({ caseCount: 50, samples: 3, seed: 21, rate: 0.7 }),
      iterations: 2000,
      seed: 4,
    });
    const large = bootstrapPassRate({
      cases: buildCases({ caseCount: 800, samples: 3, seed: 21, rate: 0.7 }),
      iterations: 2000,
      seed: 4,
    });
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  /**
   * The test that actually proves the cluster bootstrap is correct: under a
   * known generative model the nominal 95% interval should cover the true
   * parameter about 95% of the time.
   *
   * Generative model: each case draws a latent difficulty p_i ~ Uniform(0.4, 1)
   * (mean 0.7, which is the estimand) and then k = 3 Bernoulli(p_i) samples.
   * The within-case correlation is real, so a flat bootstrap would under-cover
   * here.
   *
   * The band is wide (0.90-0.99) so the assertion is about correctness, not
   * about hitting 0.95 exactly. The run is seeded, so it cannot flake.
   */
  it("achieves close to nominal coverage under a known generative model", () => {
    const trials = 300;
    const trueRate = 0.7;
    let covered = 0;

    for (let trial = 0; trial < trials; trial++) {
      const random = mulberry32(100_000 + trial);
      const cases: CaseSamples[] = [];
      for (let i = 0; i < 100; i++) {
        const latent = 0.4 + random() * 0.6;
        const passes = [0, 1, 2].map(() => random() < latent);
        cases.push({ caseId: `c${i}`, passes });
      }
      const { lower, upper } = bootstrapPassRate({
        cases,
        iterations: 300,
        seed: 500_000 + trial,
      });
      if (lower <= trueRate && trueRate <= upper) covered++;
    }

    const coverage = covered / trials;
    expect(coverage).toBeGreaterThanOrEqual(0.9);
    expect(coverage).toBeLessThanOrEqual(0.99);
  });

  /**
   * Documents WHY the clustering exists. With perfectly correlated samples
   * inside each case (a case either always passes or always fails), the real
   * sample size is 200 cases, not 1600 samples. A flat bootstrap over the
   * pooled samples reports an interval roughly sqrt(8) times too narrow.
   *
   * If someone "simplifies" the cluster bootstrap into a flat one, this fails.
   */
  it("yields a wider interval than a naive flat bootstrap on correlated samples", () => {
    const samplesPerCase = 8;
    const random = mulberry32(1234);
    const cases: CaseSamples[] = [];
    for (let i = 0; i < 200; i++) {
      const allPass = random() < 0.7;
      cases.push({
        caseId: `c${i}`,
        passes: new Array<boolean>(samplesPerCase).fill(allPass),
      });
    }

    const clustered = bootstrapPassRate({ cases, iterations: 3000, seed: 77 });
    const naive = naiveFlatBootstrap({ cases, iterations: 3000, seed: 77 });

    const clusteredWidth = clustered.upper - clustered.lower;
    const naiveWidth = naive.upper - naive.lower;

    expect(clustered.estimate).toBeCloseTo(naive.estimate, 10);
    expect(clusteredWidth).toBeGreaterThan(naiveWidth * 2);
  });

  it("returns NaN for an empty case list rather than a fake interval", () => {
    const result = bootstrapPassRate({ cases: [], iterations: 100, seed: 1 });
    expect(result.caseCount).toBe(0);
    expect(Number.isNaN(result.estimate)).toBe(true);
  });
});

describe("pairedBootstrapDelta", () => {
  it("is deterministic for a fixed seed", () => {
    const pairs = buildPairs({ caseCount: 80, samples: 3, seed: 8, lift: 0.1 });
    const a = pairedBootstrapDelta({ pairs, iterations: 500, seed: 12 });
    const b = pairedBootstrapDelta({ pairs, iterations: 500, seed: 12 });
    expect(a).toEqual(b);
  });

  it("recovers a real lift with an interval that excludes zero", () => {
    const pairs = buildPairs({
      caseCount: 400,
      samples: 3,
      seed: 31,
      lift: 0.2,
    });
    const result = pairedBootstrapDelta({ pairs, iterations: 2000, seed: 3 });
    expect(result.delta).toBeGreaterThan(0);
    expect(result.lower).toBeGreaterThan(0);
  });

  it("keeps zero inside the interval when the arms are identical", () => {
    const pairs = buildPairs({ caseCount: 300, samples: 3, seed: 13, lift: 0 });
    const result = pairedBootstrapDelta({ pairs, iterations: 2000, seed: 6 });
    expect(result.lower).toBeLessThanOrEqual(0);
    expect(result.upper).toBeGreaterThanOrEqual(0);
  });

  /**
   * Pairing only pays off to the extent that the two arms' per-case rates are
   * correlated — that shared component is what drawing both arms together
   * cancels. Sampling noise attenuates that correlation hard: with this
   * generator at k=3 the realized per-case correlation is only ~0.35 and the
   * paired interval is indistinguishable from the unpaired one, because
   * Bernoulli noise (var ~ p(1-p)/k ~ 0.07 per arm) swamps the case-level
   * latent spread (var ~ 0.041). At k=30 the correlation reaches ~0.84 and
   * pairing wins clearly.
   *
   * So this test runs in the regime where pairing is supposed to help. It is
   * NOT evidence that pairing is useless at low k in practice: real per-case
   * outcomes are far more deterministic than this generator's independent coin
   * flips, so the true correlation is much higher than the model implies.
   */
  it("produces a narrower interval than resampling the arms independently", () => {
    const pairs = buildPairs({
      caseCount: 300,
      samples: 30,
      seed: 17,
      lift: 0.1,
    });
    const paired = pairedBootstrapDelta({ pairs, iterations: 2000, seed: 9 });
    const unpaired = unpairedBootstrapDelta({
      pairs,
      iterations: 2000,
      seed: 9,
    });
    expect(paired.upper - paired.lower).toBeLessThan(
      unpaired.upper - unpaired.lower,
    );
  });

  it("returns NaN for an empty pair list", () => {
    const result = pairedBootstrapDelta({
      pairs: [],
      iterations: 100,
      seed: 1,
    });
    expect(Number.isNaN(result.delta)).toBe(true);
  });
});

describe("pairedMde", () => {
  it("is deterministic for a fixed seed", () => {
    const args = {
      caseCount: 178,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      trials: 120,
      seed: 99,
    };
    expect(pairedMde(args)).toBe(pairedMde(args));
  });

  it("shrinks as the case count grows", () => {
    const small = pairedMde({
      caseCount: 178,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      trials: 200,
      seed: 5,
    });
    const large = pairedMde({
      caseCount: 2000,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      trials: 200,
      seed: 5,
    });
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large ?? 1).toBeLessThan(small ?? 0);
  });

  it("shrinks as samples per case grows", () => {
    const single = pairedMde({
      caseCount: 500,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      samplesPerCase: 1,
      trials: 200,
      seed: 5,
    });
    const triple = pairedMde({
      caseCount: 500,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      samplesPerCase: 3,
      trials: 200,
      seed: 5,
    });
    expect(triple ?? 1).toBeLessThan(single ?? 0);
  });

  /**
   * The headline claim of the whole harness: the current suite shape cannot see
   * a sub-10-point move, while the target shape gets under ~4 points.
   */
  it("confirms 178 cases at k=1 cannot detect under about 10 points", () => {
    const mde = pairedMde({
      caseCount: 178,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      samplesPerCase: 1,
      trials: 400,
      seed: 2026,
    });
    expect(mde).not.toBeNull();
    expect(mde ?? 0).toBeGreaterThan(0.08);
  });

  it("confirms 1000 cases at k=3 reaches a few points", () => {
    const mde = pairedMde({
      caseCount: 1000,
      baselineRate: 0.7,
      discordanceRate: 0.25,
      samplesPerCase: 3,
      trials: 400,
      seed: 2026,
    });
    expect(mde).not.toBeNull();
    expect(mde ?? 1).toBeLessThan(0.04);
  });

  it("returns null when no effect is detectable", () => {
    expect(
      pairedMde({
        caseCount: 4,
        baselineRate: 0.7,
        discordanceRate: 0.25,
        trials: 100,
        seed: 1,
      }),
    ).toBeNull();
    expect(
      pairedMde({
        caseCount: 500,
        baselineRate: 0.7,
        discordanceRate: 0,
        trials: 100,
        seed: 1,
      }),
    ).toBeNull();
  });
});

describe("summarizeComparison", () => {
  it("reports IMPROVED on a large unambiguous lift", () => {
    const pairs = buildPairs({
      caseCount: 400,
      samples: 3,
      seed: 44,
      lift: 0.25,
    });
    const result = summarizeComparison({ pairs, iterations: 1500, seed: 2 });
    expect(result.verdict).toBe("IMPROVED");
    expect(result.delta).toBeGreaterThan(0);
    expect(result.mde).toBeNull();
  });

  it("reports REGRESSED on a large unambiguous drop", () => {
    const pairs = buildPairs({
      caseCount: 400,
      samples: 3,
      seed: 44,
      lift: -0.25,
    });
    const result = summarizeComparison({ pairs, iterations: 1500, seed: 2 });
    expect(result.verdict).toBe("REGRESSED");
    expect(result.delta).toBeLessThan(0);
  });

  it("reports NO_EFFECT_DETECTED with an MDE when the arms are identical", () => {
    const pairs = buildPairs({ caseCount: 178, samples: 1, seed: 55, lift: 0 });
    const result = summarizeComparison({
      pairs,
      iterations: 1000,
      seed: 3,
      mdeTrials: 150,
    });
    expect(result.verdict).toBe("NO_EFFECT_DETECTED");
    // The number that separates "we measured nothing" from "there is nothing".
    expect(result.mde).not.toBeNull();
    expect(result.mde ?? 0).toBeGreaterThan(0);
  });

  it("is dragged to INCONCLUSIVE by an unrelated family member", () => {
    const pairs = buildPairs({
      caseCount: 250,
      samples: 3,
      seed: 61,
      lift: 0.08,
    });
    const alone = summarizeComparison({ pairs, iterations: 1500, seed: 4 });
    const inFamily = summarizeComparison({
      pairs,
      iterations: 1500,
      seed: 4,
      otherPValuesInFamily: new Array<number>(10).fill(0.001),
    });
    expect(inFamily.adjustedPValue).toBeGreaterThan(alone.adjustedPValue);
  });

  it("returns INCONCLUSIVE rather than the flattering reading when signs disagree", () => {
    // Hand-built so the two tests genuinely point opposite ways.
    //
    // 12 "cross" cases move the variant over the 0.5 binarization threshold
    // (0.50 -> 0.75), so McNemar counts 12 variant-only wins and zero
    // baseline-only wins: sign +1.
    //
    // 40 "slide" cases drop by the same 0.25 (1.00 -> 0.75) but stay above the
    // threshold in both arms, so McNemar cannot see them at all. Wilcoxon does:
    // every delta has magnitude 0.25, so all 52 share rank 26.5 and
    // W+ = 12 * 26.5 = 318 against a null mean of 52*53/4 = 689: sign -1.
    const pairs: PairedCase[] = [];
    for (let i = 0; i < 12; i++) {
      pairs.push({
        caseId: `cross${i}`,
        baseline: [true, true, false, false],
        variant: [true, true, true, false],
      });
    }
    for (let i = 0; i < 40; i++) {
      pairs.push({
        caseId: `slide${i}`,
        baseline: [true, true, true, true],
        variant: [true, true, true, false],
      });
    }
    const result = summarizeComparison({ pairs, iterations: 800, seed: 8 });
    expect(result.signsAgree).toBe(false);
    expect(result.verdict).toBe("INCONCLUSIVE");
  });

  it("is deterministic for a fixed seed", () => {
    const pairs = buildPairs({
      caseCount: 150,
      samples: 3,
      seed: 71,
      lift: 0.05,
    });
    const a = summarizeComparison({
      pairs,
      iterations: 800,
      seed: 15,
      mdeTrials: 80,
    });
    const b = summarizeComparison({
      pairs,
      iterations: 800,
      seed: 15,
      mdeTrials: 80,
    });
    expect(a).toEqual(b);
  });

  it("handles an empty comparison without inventing a verdict", () => {
    const result = summarizeComparison({ pairs: [], iterations: 100, seed: 1 });
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.caseCount).toBe(0);
  });
});

describe("mulberry32", () => {
  it("is reproducible and stays in [0, 1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("has a mean near 0.5 over many draws", () => {
    const random = mulberry32(2024);
    let total = 0;
    for (let i = 0; i < 200_000; i++) total += random();
    expect(total / 200_000).toBeCloseTo(0.5, 2);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCases({
  caseCount,
  samples,
  seed,
  rate,
}: {
  caseCount: number;
  samples: number;
  seed: number;
  rate: number;
}): CaseSamples[] {
  const random = mulberry32(seed);
  const cases: CaseSamples[] = [];
  for (let i = 0; i < caseCount; i++) {
    const latent = clamp(rate + (random() - 0.5) * 0.6);
    const passes: boolean[] = [];
    for (let s = 0; s < samples; s++) passes.push(random() < latent);
    cases.push({ caseId: `case-${i}`, passes });
  }
  return cases;
}

function buildPairs({
  caseCount,
  samples,
  seed,
  lift,
}: {
  caseCount: number;
  samples: number;
  seed: number;
  lift: number;
}): PairedCase[] {
  const random = mulberry32(seed);
  const pairs: PairedCase[] = [];
  for (let i = 0; i < caseCount; i++) {
    // Strong case-level heterogeneity so the paired design has something to
    // cancel out.
    const latent = clamp(0.15 + random() * 0.7);
    const variantLatent = clamp(latent + lift);
    const baseline: boolean[] = [];
    const variant: boolean[] = [];
    for (let s = 0; s < samples; s++) {
      baseline.push(random() < latent);
      variant.push(random() < variantLatent);
    }
    pairs.push({ caseId: `case-${i}`, baseline, variant });
  }
  return pairs;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Deliberately wrong: resamples pooled samples as if they were independent. */
function naiveFlatBootstrap({
  cases,
  iterations,
  seed,
}: {
  cases: CaseSamples[];
  iterations: number;
  seed: number;
}): { estimate: number; lower: number; upper: number } {
  const pooled: number[] = [];
  for (const item of cases)
    for (const pass of item.passes) pooled.push(pass ? 1 : 0);

  const total = pooled.reduce((sum, value) => sum + value, 0);
  const drawsPerReplicate = pooled.length;
  const random = mulberry32(seed);
  const replicates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let draw = 0; draw < drawsPerReplicate; draw++) {
      sum += pooled[Math.floor(random() * pooled.length)] ?? 0;
    }
    replicates.push(sum / pooled.length);
  }
  replicates.sort((a, b) => a - b);
  return {
    estimate: total / pooled.length,
    lower: replicates[Math.floor(0.025 * (iterations - 1))] ?? 0,
    upper: replicates[Math.ceil(0.975 * (iterations - 1))] ?? 0,
  };
}

/**
 * Deliberately unpaired: each arm draws its own cases, so shared case
 * difficulty no longer cancels. Identical to pairedBootstrapDelta in every
 * other respect, including the within-case resampling, so the width difference
 * isolates the pairing alone.
 */
function unpairedBootstrapDelta({
  pairs,
  iterations,
  seed,
}: {
  pairs: PairedCase[];
  iterations: number;
  seed: number;
}): { lower: number; upper: number } {
  const random = mulberry32(seed);
  const resample = (passes: boolean[]) => {
    const rate = passes.filter(Boolean).length / passes.length;
    let hits = 0;
    for (let draw = 0; draw < passes.length; draw++)
      if (random() < rate) hits++;
    return hits / passes.length;
  };
  const drawsPerReplicate = pairs.length;
  const replicates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let baselineTotal = 0;
    let variantTotal = 0;
    for (let draw = 0; draw < drawsPerReplicate; draw++) {
      const baselinePair = pairs[Math.floor(random() * pairs.length)];
      const variantPair = pairs[Math.floor(random() * pairs.length)];
      baselineTotal += baselinePair ? resample(baselinePair.baseline) : 0;
      variantTotal += variantPair ? resample(variantPair.variant) : 0;
    }
    replicates.push((variantTotal - baselineTotal) / pairs.length);
  }
  replicates.sort((a, b) => a - b);
  return {
    lower: replicates[Math.floor(0.025 * (iterations - 1))] ?? 0,
    upper: replicates[Math.ceil(0.975 * (iterations - 1))] ?? 0,
  };
}
