export type TokenCounts = { good: number; spam: number };
export type ModelCounts = TokenCounts & { bias: number };

export function tokenProbability(
  token: TokenCounts,
  model: ModelCounts,
): number {
  const goodRate = token.good / Math.max(model.good, 1);
  const spamRate = token.spam / Math.max(model.spam, 1);
  const rate = goodRate + spamRate;
  const ratio = rate > Number.MIN_VALUE ? spamRate / rate : 0;
  const weight = 1 + 6 * Math.abs(model.bias);
  const support =
    model.bias > 0
      ? token.good / weight + token.spam * weight
      : token.good * weight + token.spam / weight;
  return Math.fround((support * ratio + 0.005) / (support + 0.01));
}

export function scoreTokens(
  candidates: { token: string; occurrences: number; probability: number }[],
) {
  const selected = candidates
    .filter((candidate) => Math.abs(candidate.probability - 0.5) >= 0.1)
    .sort(
      (a, b) =>
        Math.abs(b.probability - 0.5) - Math.abs(a.probability - 0.5) ||
        a.token.localeCompare(b.token, "en"),
    )
    .flatMap((candidate) =>
      Array.from(
        { length: Math.min(2, candidate.occurrences) },
        () => candidate,
      ),
    )
    .slice(0, 15);
  if (!selected.length) return { score: 0.5, selected };
  const logSpam = selected.reduce(
    (sum, word) => sum + Math.log(word.probability),
    0,
  );
  const logGood = selected.reduce(
    (sum, word) =>
      sum + Math.log(1 - Math.min(word.probability, 0.999_999_999_9)),
    0,
  );
  const spamTail = logTail(-logSpam, selected.length);
  const goodTail = logTail(-logGood, selected.length);
  const difference = goodTail - spamTail;
  const score =
    difference > 700
      ? 0
      : difference < -700
        ? 1
        : 1 / (1 + Math.exp(difference));
  return { score, selected };
}

function logTail(x: number, count: number): number {
  if (!Number.isFinite(x)) return Number.NEGATIVE_INFINITY;
  if (x === 0) return 0;
  let term = 0;
  let sum = 0;
  for (let index = 1; index < count; index++) {
    term += Math.log(x) - Math.log(index);
    const maximum = Math.max(sum, term);
    sum =
      maximum + Math.log(Math.exp(sum - maximum) + Math.exp(term - maximum));
  }
  return -x + sum;
}
