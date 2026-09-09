/**
 * Statistics core for the eval harness.
 *
 * Everything here is deterministic given a seed. No I/O, no network, no LLM
 * calls. The whole point is that a reported number can be re-derived exactly.
 */

export type CaseSamples = { caseId: string; passes: boolean[] };

export type PairedCase = {
  caseId: string;
  baseline: boolean[];
  variant: boolean[];
};

export type PassRateInterval = {
  estimate: number;
  lower: number;
  upper: number;
  caseCount: number;
};

export type McNemarResult = {
  discordant: number;
  baselineOnly: number;
  variantOnly: number;
  pValue: number;
  chiSquareContinuityCorrected: number;
};

export type DeltaInterval = { delta: number; lower: number; upper: number };

export type WilcoxonResult = { statistic: number; pValue: number; n: number };

export type KappaResult = {
  kappa: number;
  observed: number;
  expected: number;
  n: number;
};

export type Verdict =
  | "IMPROVED"
  | "REGRESSED"
  | "NO_EFFECT_DETECTED"
  | "INCONCLUSIVE";

export type ComparisonSummary = {
  verdict: Verdict;
  caseCount: number;
  baselineRate: number;
  variantRate: number;
  delta: number;
  lower: number;
  upper: number;
  ciExcludesZero: boolean;
  mcnemar: McNemarResult;
  wilcoxon: WilcoxonResult;
  adjustedPValue: number;
  significant: boolean;
  signsAgree: boolean;
  /** Only populated for NO_EFFECT_DETECTED: the smallest effect this n could
   * have found at 80% power. Distinguishes "we measured nothing" from "we
   * measured that there is nothing". */
  mde: number | null;
};

const DEFAULT_SEED = 20_260_726;

/**
 * mulberry32: 32-bit seeded PRNG. Fast, well-distributed enough for
 * resampling, and short enough to audit. Every interval in this file is
 * reproducible from its seed.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Cluster bootstrap for an overall pass rate.
 *
 * The unit of independence is the CASE, not the sample. The k samples inside
 * one case share an input, a prompt and a judge, so they are correlated; a
 * naive flat bootstrap over all n*k samples treats them as independent and
 * reports an interval that is too narrow, often by 2-3x. That is the single
 * most common way an eval harness lies about its own precision.
 *
 * So: resample cases with replacement, then resample the drawn case's samples
 * with replacement.
 *
 * The second stage is a deliberate estimand choice. Resampling clusters only
 * would answer "what if we reran on different cases but reused these exact
 * generations". Resampling within the case too answers "what if we reran the
 * whole suite: different cases AND fresh generations", which is the question
 * anyone reading an eval number is actually asking, since the model is
 * stochastic. It gives a slightly wider interval than cluster-only resampling.
 *
 * Percentile method rather than BCa. At n >= 300 with a rate away from 0 and 1
 * the bias/acceleration correction moves the endpoints by well under a point,
 * and percentile is auditable in ten lines.
 *
 * The point estimate is the mean of per-case rates (each case weighted
 * equally), which is the estimand the cluster bootstrap actually targets. With
 * equal k across cases it coincides with the pooled sample rate.
 */
export function bootstrapPassRate({
  cases,
  iterations = 10_000,
  alpha = 0.05,
  seed = DEFAULT_SEED,
}: {
  cases: CaseSamples[];
  iterations?: number;
  alpha?: number;
  seed?: number;
}): PassRateInterval {
  const caseCount = cases.length;
  if (caseCount === 0) {
    return {
      estimate: Number.NaN,
      lower: Number.NaN,
      upper: Number.NaN,
      caseCount: 0,
    };
  }

  const rates: number[] = [];
  const sizes: number[] = [];
  for (const item of cases) {
    rates.push(rateOf(item.passes));
    sizes.push(item.passes.length);
  }

  const estimate = mean(rates);
  const random = mulberry32(seed);
  const replicates: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration++) {
    let total = 0;
    for (let i = 0; i < caseCount; i++) {
      const drawn = Math.floor(random() * caseCount);
      total += resampleRate(rates[drawn] ?? 0, sizes[drawn] ?? 0, random);
    }
    replicates.push(total / caseCount);
  }

  replicates.sort((a, b) => a - b);
  return {
    estimate,
    lower: quantile(replicates, alpha / 2),
    upper: quantile(replicates, 1 - alpha / 2),
    caseCount,
  };
}

/**
 * Two-sided exact McNemar test on discordant pairs.
 *
 * `b` = baseline passed and variant failed, `c` = baseline failed and variant
 * passed. Under the null the discordant pairs split 50/50, so this is an exact
 * binomial sign test on b+c trials.
 *
 * Exact, not chi-square. Discordant counts in these suites run 25-60, right at
 * or below the b+c >= 25 threshold where the continuity-corrected chi-square
 * approximation is normally recommended, and that approximation is
 * over-conservative: it under-rejects, so it makes you MISS real improvements.
 * The corrected chi-square statistic is reported alongside as a familiar
 * cross-check (df=1, so 3.841 is the alpha=0.05 critical value), but the exact
 * p-value is what decides.
 */
export function mcnemarExact({
  b,
  c,
}: {
  b: number;
  c: number;
}): McNemarResult {
  const discordant = b + c;
  if (discordant === 0) {
    return {
      discordant: 0,
      baselineOnly: b,
      variantOnly: c,
      pValue: 1,
      chiSquareContinuityCorrected: 0,
    };
  }

  const logHalfPower = discordant * Math.log(0.5);
  const tailCutoff = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= tailCutoff; i++) {
    tail += Math.exp(logChoose(discordant, i) + logHalfPower);
  }

  // Doubling the lower tail is the standard two-sided rule for a symmetric
  // null; it can exceed 1 when b is close to c, hence the cap.
  const pValue = Math.min(1, 2 * tail);

  // Edwards' continuity correction. Clamped at zero so that b === c yields 0
  // rather than the spurious 1/(b+c) the raw formula produces.
  const corrected = Math.max(0, Math.abs(b - c) - 1);
  return {
    discordant,
    baselineOnly: b,
    variantOnly: c,
    pValue,
    chiSquareContinuityCorrected: (corrected * corrected) / discordant,
  };
}

/**
 * Paired cluster bootstrap for the pass-rate delta (variant minus baseline).
 *
 * The case is drawn once and BOTH arms come with it. That is what makes it
 * paired: shared case difficulty cancels inside the replicate instead of
 * inflating the interval, which is the entire reason a paired design is worth
 * running. Within the drawn case each arm is then resampled independently.
 */
export function pairedBootstrapDelta({
  pairs,
  iterations = 10_000,
  alpha = 0.05,
  seed = DEFAULT_SEED,
}: {
  pairs: PairedCase[];
  iterations?: number;
  alpha?: number;
  seed?: number;
}): DeltaInterval {
  const caseCount = pairs.length;
  if (caseCount === 0) {
    return { delta: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  }

  const baselineRates: number[] = [];
  const baselineSizes: number[] = [];
  const variantRates: number[] = [];
  const variantSizes: number[] = [];
  for (const pair of pairs) {
    baselineRates.push(rateOf(pair.baseline));
    baselineSizes.push(pair.baseline.length);
    variantRates.push(rateOf(pair.variant));
    variantSizes.push(pair.variant.length);
  }

  const delta = mean(variantRates) - mean(baselineRates);
  const random = mulberry32(seed);
  const replicates: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration++) {
    let total = 0;
    for (let i = 0; i < caseCount; i++) {
      const drawn = Math.floor(random() * caseCount);
      const baseline = resampleRate(
        baselineRates[drawn] ?? 0,
        baselineSizes[drawn] ?? 0,
        random,
      );
      const variant = resampleRate(
        variantRates[drawn] ?? 0,
        variantSizes[drawn] ?? 0,
        random,
      );
      total += variant - baseline;
    }
    replicates.push(total / caseCount);
  }

  replicates.sort((a, b) => a - b);
  return {
    delta,
    lower: quantile(replicates, alpha / 2),
    upper: quantile(replicates, 1 - alpha / 2),
  };
}

/**
 * Wilcoxon signed-rank test on per-case rate deltas.
 *
 * Distribution-free cross-check on the bootstrap: it uses the magnitude of the
 * per-case deltas, not just their sign like McNemar, so it catches "many small
 * consistent shifts" that a sign test would shrug at.
 *
 * `statistic` is W+, the sum of ranks of positive deltas. Some texts report
 * min(W+, W-) or the signed-rank sum instead; W+ is used here because it keeps
 * the DIRECTION of the effect recoverable (W+ above n(n+1)/4 means the variant
 * won), which summarizeComparison needs. The two-sided p-value is identical
 * under either convention since W+ and W- are symmetric about the null mean.
 *
 * Limitation: this is the normal approximation with tie and continuity
 * corrections, not the exact permutation distribution. It is accurate from
 * roughly n >= 20 after dropping zero deltas, which is the regime these suites
 * run in. Below that, p-values here are indicative only.
 */
export function wilcoxonSignedRank(deltas: number[]): WilcoxonResult {
  const nonZero = deltas.filter((d) => d !== 0);
  const n = nonZero.length;
  if (n === 0) return { statistic: 0, pValue: 1, n: 0 };

  const magnitudes = nonZero.map((d) => Math.abs(d));
  const order = magnitudes
    .map((_, index) => index)
    .sort((a, b) => (magnitudes[a] ?? 0) - (magnitudes[b] ?? 0));

  const ranks = new Array<number>(n).fill(0);
  let tieCorrection = 0;
  let start = 0;
  while (start < n) {
    const startValue = magnitudes[order[start] ?? 0] ?? 0;
    let end = start;
    while (
      end + 1 < n &&
      (magnitudes[order[end + 1] ?? 0] ?? 0) === startValue
    ) {
      end++;
    }
    const averageRank = (start + end) / 2 + 1;
    for (let i = start; i <= end; i++) ranks[order[i] ?? 0] = averageRank;
    const tieSize = end - start + 1;
    if (tieSize > 1) tieCorrection += tieSize ** 3 - tieSize;
    start = end + 1;
  }

  let statistic = 0;
  for (let i = 0; i < n; i++) {
    if ((nonZero[i] ?? 0) > 0) statistic += ranks[i] ?? 0;
  }

  const nullMean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection / 48;
  if (variance <= 0) return { statistic, pValue: 1, n };

  const z = Math.max(
    0,
    (Math.abs(statistic - nullMean) - 0.5) / Math.sqrt(variance),
  );
  return { statistic, pValue: Math.min(1, 2 * normalSurvival(z)), n };
}

/**
 * Holm-Bonferroni step-down, returned in the caller's original order.
 *
 * Needed for ablation: 11 uncorrected tests at alpha=0.05 produce at least one
 * false positive about 43% of the time (1 - 0.95^11). Holm controls the
 * family-wise error rate without Bonferroni's power loss on the smallest
 * p-values.
 */
export function holmAdjust(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];

  const order = pValues
    .map((_, index) => index)
    .sort((a, b) => (pValues[a] ?? 1) - (pValues[b] ?? 1));

  const adjusted = new Array<number>(m).fill(0);
  let running = 0;
  for (let rank = 0; rank < m; rank++) {
    const index = order[rank] ?? 0;
    // Running max enforces monotonicity: an adjusted p can never fall below
    // the adjusted p of a smaller raw p-value.
    running = Math.max(running, (m - rank) * (pValues[index] ?? 1));
    adjusted[index] = Math.min(1, running);
  }
  return adjusted;
}

/**
 * Cohen's kappa for judge calibration against human labels.
 *
 * Raw agreement is misleading when the pass rate is far from 50%: a judge that
 * says "pass" every time scores 70% agreement against a 70%-pass human set
 * while carrying zero information. Kappa subtracts the agreement expected by
 * chance.
 */
export function cohensKappa({
  bothPass,
  judgePassHumanFail,
  judgeFailHumanPass,
  bothFail,
}: {
  bothPass: number;
  judgePassHumanFail: number;
  judgeFailHumanPass: number;
  bothFail: number;
}): KappaResult {
  const n = bothPass + judgePassHumanFail + judgeFailHumanPass + bothFail;
  if (n === 0)
    return {
      kappa: Number.NaN,
      observed: Number.NaN,
      expected: Number.NaN,
      n: 0,
    };

  const observed = (bothPass + bothFail) / n;
  const judgePass = (bothPass + judgePassHumanFail) / n;
  const humanPass = (bothPass + judgeFailHumanPass) / n;
  const expected = judgePass * humanPass + (1 - judgePass) * (1 - humanPass);

  // expected === 1 means both raters were constant and identical, so there is
  // no chance-corrected information to extract; agreement is either total or
  // impossible.
  const kappa =
    expected >= 1
      ? observed >= 1
        ? 1
        : 0
      : (observed - expected) / (1 - expected);

  return { kappa, observed, expected, n };
}

/**
 * Minimum detectable effect for a paired design, by simulation.
 *
 * Generative model, chosen to reproduce the standard McNemar parameterization
 * at k=1 while extending cleanly to k>1:
 *
 *   - A fraction of cases are "unstable": the baseline flips like a coin
 *     (p=0.5), and these are the only cases the variant can move. Their
 *     variant rate is 0.5 + effect/unstableFraction, so the marginal effect
 *     across all cases is exactly `effect`.
 *   - Every other case is deterministic (always passes or always fails) and
 *     contributes a per-case delta of exactly zero.
 *   - unstableFraction = 2 * discordanceRate, because an unstable case is
 *     discordant with probability 0.5 at k=1. That makes `discordanceRate`
 *     mean literally what McNemar means by it.
 *
 * `baselineRate` is accepted and deliberately not read, which is correct rather
 * than a modelling gap: paired power depends on the discordance rate and the
 * effect, not on the marginal pass rate. It stays in the signature so a caller
 * reporting an MDE has to state the baseline it was computed against, and so
 * that a future feasibility check (enough passing and failing cases to support
 * the requested discordance) does not change the call sites.
 *
 * Increasing k shrinks the per-case delta variance by 1/k, which is exactly
 * the lever the harness is buying when it runs more samples per case.
 *
 * Significance per simulated experiment uses the asymptotic paired test on
 * per-case deltas rather than a nested bootstrap. At these case counts the two
 * agree closely, and a nested bootstrap would make the grid search minutes
 * long instead of seconds.
 *
 * Returns the realized effect as a proportion, or null if no effect in the
 * grid reaches the target power.
 */
export function pairedMde({
  caseCount,
  discordanceRate,
  alpha = 0.05,
  power = 0.8,
  seed = DEFAULT_SEED,
  samplesPerCase = 1,
  trials = 600,
  effectGrid = defaultEffectGrid(),
}: {
  caseCount: number;
  baselineRate: number;
  discordanceRate: number;
  alpha?: number;
  power?: number;
  seed?: number;
  samplesPerCase?: number;
  trials?: number;
  effectGrid?: number[];
}): number | null {
  if (caseCount < 2 || discordanceRate <= 0 || effectGrid.length === 0) {
    return null;
  }

  const unstableFraction = Math.min(1, 2 * discordanceRate);
  const criticalZ = normalQuantile(1 - alpha / 2);

  const powerAt = (effect: number) =>
    simulatePairedPower({
      effect,
      caseCount,
      unstableFraction,
      samplesPerCase,
      criticalZ,
      trials,
      // Same stream for every candidate effect (common random numbers), which
      // keeps simulated power monotone in the effect and makes the binary
      // search below safe.
      seed,
    });

  const lastIndex = effectGrid.length - 1;
  if (powerAt(effectGrid[lastIndex] ?? 0) < power) return null;

  let lo = 0;
  let hi = lastIndex;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (powerAt(effectGrid[mid] ?? 0) >= power) hi = mid;
    else lo = mid + 1;
  }

  // The requested effect can be unreachable if it needs an unstable-case
  // variant rate above 1; report what the model actually delivered.
  return realizedEffect(effectGrid[lo] ?? 0, unstableFraction);
}

/**
 * Full verdict for one baseline-vs-variant comparison.
 *
 * The state machine deliberately has no "close enough" branch. A result is
 * only IMPROVED or REGRESSED when the bootstrap CI excludes zero AND the
 * Holm-adjusted McNemar p clears alpha AND McNemar and Wilcoxon agree on the
 * direction. Any disagreement between those three is INCONCLUSIVE, never the
 * flattering reading.
 *
 * `otherPValuesInFamily` should carry the other tests run in the same
 * decision (e.g. the other arms of an ablation) so Holm corrects across the
 * real family rather than a family of one.
 */
export function summarizeComparison({
  pairs,
  alpha = 0.05,
  iterations = 10_000,
  seed = DEFAULT_SEED,
  otherPValuesInFamily = [],
  mdeTrials = 400,
}: {
  pairs: PairedCase[];
  alpha?: number;
  iterations?: number;
  seed?: number;
  otherPValuesInFamily?: number[];
  mdeTrials?: number;
}): ComparisonSummary {
  const caseCount = pairs.length;
  const emptyMcNemar = mcnemarExact({ b: 0, c: 0 });
  if (caseCount === 0) {
    return {
      verdict: "INCONCLUSIVE",
      caseCount: 0,
      baselineRate: Number.NaN,
      variantRate: Number.NaN,
      delta: Number.NaN,
      lower: Number.NaN,
      upper: Number.NaN,
      ciExcludesZero: false,
      mcnemar: emptyMcNemar,
      wilcoxon: { statistic: 0, pValue: 1, n: 0 },
      adjustedPValue: 1,
      significant: false,
      signsAgree: true,
      mde: null,
    };
  }

  const baselineRates = pairs.map((pair) => rateOf(pair.baseline));
  const variantRates = pairs.map((pair) => rateOf(pair.variant));
  const deltas = pairs.map(
    (_, index) => (variantRates[index] ?? 0) - (baselineRates[index] ?? 0),
  );

  // Case-level binarization for McNemar. With odd k this is a plain majority
  // vote; with even k a 50/50 split counts as a fail, which is arbitrary but
  // symmetric across arms, so it cannot bias the direction. Prefer odd k.
  let baselineOnly = 0;
  let variantOnly = 0;
  for (let i = 0; i < caseCount; i++) {
    const baselinePass = (baselineRates[i] ?? 0) > 0.5;
    const variantPass = (variantRates[i] ?? 0) > 0.5;
    if (baselinePass && !variantPass) baselineOnly++;
    else if (!baselinePass && variantPass) variantOnly++;
  }

  const mcnemar = mcnemarExact({ b: baselineOnly, c: variantOnly });
  const wilcoxon = wilcoxonSignedRank(deltas);
  const interval = pairedBootstrapDelta({ pairs, iterations, alpha, seed });

  const adjustedPValue =
    holmAdjust([mcnemar.pValue, ...otherPValuesInFamily])[0] ?? 1;
  const significant = adjustedPValue < alpha;
  const ciExcludesZero = interval.lower > 0 || interval.upper < 0;

  const mcnemarSign = Math.sign(variantOnly - baselineOnly);
  const wilcoxonSign = Math.sign(
    wilcoxon.statistic - (wilcoxon.n * (wilcoxon.n + 1)) / 4,
  );
  const signsAgree =
    mcnemarSign === 0 || wilcoxonSign === 0 || mcnemarSign === wilcoxonSign;

  const verdict = decideVerdict({
    signsAgree,
    ciExcludesZero,
    significant,
    improved: interval.lower > 0,
  });

  const mde =
    verdict === "NO_EFFECT_DETECTED"
      ? pairedMde({
          caseCount,
          baselineRate: mean(baselineRates),
          discordanceRate: mcnemar.discordant / caseCount,
          alpha,
          seed,
          samplesPerCase: minSamplesPerCase(pairs),
          trials: mdeTrials,
        })
      : null;

  return {
    verdict,
    caseCount,
    baselineRate: mean(baselineRates),
    variantRate: mean(variantRates),
    delta: interval.delta,
    lower: interval.lower,
    upper: interval.upper,
    ciExcludesZero,
    mcnemar,
    wilcoxon,
    adjustedPValue,
    significant,
    signsAgree,
    mde,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rateOf(passes: boolean[]): number {
  if (passes.length === 0) return Number.NaN;
  let count = 0;
  for (const pass of passes) if (pass) count++;
  return count / passes.length;
}

function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Resampling a case's k booleans with replacement and taking the mean is
 * exactly Binomial(k, observedRate)/k, so we draw it directly instead of
 * materializing index draws. Same distribution, same number of PRNG calls.
 */
function resampleRate(
  rate: number,
  size: number,
  random: () => number,
): number {
  if (size === 0) return rate;
  let passes = 0;
  for (let i = 0; i < size; i++) if (random() < rate) passes++;
  return passes / size;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lowIndex = Math.floor(position);
  const highIndex = Math.ceil(position);
  const low = sorted[lowIndex] ?? 0;
  const high = sorted[highIndex] ?? low;
  return low + (high - low) * (position - lowIndex);
}

const logFactorialCache: number[] = [0, 0];

function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache.push((logFactorialCache[i - 1] ?? 0) + Math.log(i));
  }
  return logFactorialCache[n] ?? 0;
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** Abramowitz & Stegun 7.1.26; absolute error below 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absolute = Math.abs(x);
  const t = 1 / (1 + 0.327_591_1 * absolute);
  const poly =
    t *
    (0.254_829_592 +
      t *
        (-0.284_496_736 +
          t * (1.421_413_741 + t * (-1.453_152_027 + t * 1.061_405_429))));
  return sign * (1 - poly * Math.exp(-absolute * absolute));
}

function normalSurvival(z: number): number {
  return 0.5 * (1 - erf(z / Math.SQRT2));
}

/** Bisection rather than a rational approximation: slower, but obviously
 * correct and called a handful of times. */
function normalQuantile(p: number): number {
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (1 - normalSurvival(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function defaultEffectGrid(): number[] {
  const grid: number[] = [];
  for (let e = 0.0025; e <= 0.0501; e += 0.0025) grid.push(round(e));
  for (let e = 0.055; e <= 0.1501; e += 0.005) grid.push(round(e));
  for (let e = 0.16; e <= 0.4001; e += 0.01) grid.push(round(e));
  return grid;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function realizedEffect(effect: number, unstableFraction: number): number {
  if (unstableFraction <= 0) return 0;
  const variantRate = Math.min(1, 0.5 + effect / unstableFraction);
  return unstableFraction * (variantRate - 0.5);
}

function simulatePairedPower({
  effect,
  caseCount,
  unstableFraction,
  samplesPerCase,
  criticalZ,
  trials,
  seed,
}: {
  effect: number;
  caseCount: number;
  unstableFraction: number;
  samplesPerCase: number;
  criticalZ: number;
  trials: number;
  seed: number;
}): number {
  const random = mulberry32(seed);
  const variantRate = Math.min(1, 0.5 + effect / unstableFraction);
  let detected = 0;

  for (let trial = 0; trial < trials; trial++) {
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < caseCount; i++) {
      let delta = 0;
      if (random() < unstableFraction) {
        let baselinePasses = 0;
        let variantPasses = 0;
        for (let s = 0; s < samplesPerCase; s++) {
          if (random() < 0.5) baselinePasses++;
          if (random() < variantRate) variantPasses++;
        }
        delta = (variantPasses - baselinePasses) / samplesPerCase;
      }
      sum += delta;
      sumSquares += delta * delta;
    }
    const meanDelta = sum / caseCount;
    const variance =
      (sumSquares - caseCount * meanDelta * meanDelta) / (caseCount - 1);
    if (variance <= 0) continue;
    const standardError = Math.sqrt(variance / caseCount);
    if (Math.abs(meanDelta / standardError) > criticalZ) detected++;
  }

  return detected / trials;
}

function minSamplesPerCase(pairs: PairedCase[]): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (const pair of pairs) {
    smallest = Math.min(smallest, pair.baseline.length, pair.variant.length);
  }
  return Number.isFinite(smallest) ? Math.max(1, smallest) : 1;
}

function decideVerdict({
  signsAgree,
  ciExcludesZero,
  significant,
  improved,
}: {
  signsAgree: boolean;
  ciExcludesZero: boolean;
  significant: boolean;
  improved: boolean;
}): Verdict {
  if (!signsAgree) return "INCONCLUSIVE";
  if (ciExcludesZero && significant) return improved ? "IMPROVED" : "REGRESSED";
  // CI and p-value pointing opposite ways is a real signal that the evidence is
  // marginal, so it is reported as such instead of being resolved either way.
  if (ciExcludesZero !== significant) return "INCONCLUSIVE";
  return "NO_EFFECT_DETECTED";
}
