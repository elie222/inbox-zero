import { z } from "zod";

export const observationSchema = z.object({
  key: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  sender: z.string(),
  subject: z.string(),
  recipients: z.array(z.string()),
  targets: z.array(z.string()),
  observedAt: z.number(),
  rfcMessageId: z.string().optional(),
  isRead: z.boolean().optional(),
  isFlagged: z.boolean().optional(),
});
export type Observation = z.infer<typeof observationSchema>;
export const pendingCorrectionSchema = z.object({
  before: observationSchema,
  after: observationSchema,
  since: z.number(),
});
export type PendingCorrection = z.infer<typeof pendingCorrectionSchema>;
export const observationStateSchema = z.object({
  observed: z.record(z.string(), observationSchema),
  pending: z.record(z.string(), pendingCorrectionSchema),
});
export type ObservationState = z.infer<typeof observationStateSchema>;

export function observeChanges(
  state: ObservationState,
  observations: Observation[],
  now: number,
  settleMs: number,
): PendingCorrection[] {
  const ready: PendingCorrection[] = [];
  for (const observation of observations) {
    const after = { ...observation, observedAt: now };
    const previous = state.observed[after.key];
    const pending = state.pending[after.key];
    if (pending && sameTargets(pending.before, after)) {
      delete state.pending[after.key];
    } else if (pending) {
      if (!sameTargets(pending.after, after)) {
        state.pending[after.key] = { ...pending, after, since: now };
      } else if (now - pending.since >= settleMs && !isAmbiguous(after)) {
        ready.push({ ...pending, after });
      }
    } else if (previous && !sameTargets(previous, after)) {
      state.pending[after.key] = { before: previous, after, since: now };
    }
    state.observed[after.key] = after;
  }
  return ready;
}

export function completeSnapshot(
  state: ObservationState,
  current: Observation[],
  now: number,
): Observation[] {
  const present = new Set(current.map((observation) => observation.key));
  const missing = Object.values(state.observed)
    .filter(
      (old) =>
        !present.has(old.key) && (old.targets.length || state.pending[old.key]),
    )
    .map((old) => ({ ...old, targets: [], observedAt: now }));
  return [...current, ...missing];
}

export function classifyCorrection(change: PendingCorrection): {
  added: string[];
  removed: string[];
} | null {
  const before = change.before.targets;
  const after = change.after.targets;
  if (
    !before.length ||
    !after.length ||
    before.includes("@trash") ||
    after.includes("@trash") ||
    before.includes("@excluded") ||
    after.includes("@excluded") ||
    isAmbiguous(change.before) ||
    isAmbiguous(change.after)
  )
    return null;
  const oldTarget = primaryTarget(before);
  const newTarget =
    after.includes("@inbox") && !before.includes("@inbox")
      ? "@inbox"
      : primaryTarget(after);
  if (!newTarget) {
    if (oldTarget === "@junk" && after.includes("@archive"))
      return { added: [], removed: ["@junk"] };
    return null;
  }
  if (newTarget === oldTarget) return null;
  return {
    added: [newTarget],
    removed: oldTarget ? [oldTarget] : [],
  };
}

export function matchesAutomaticRoute(
  change: PendingCorrection,
  routes: { target: string; recipientDomains: string[] }[],
): boolean {
  return routes.some(
    (route) =>
      change.after.targets.includes(route.target) &&
      change.after.recipients.some((address) =>
        route.recipientDomains.some(
          (domain) =>
            address.toLowerCase().split("@")[1] === domain.toLowerCase(),
        ),
      ),
  );
}

function primaryTarget(targets: string[]): string | undefined {
  if (targets.includes("@junk")) return "@junk";
  return (
    targets.find((target) => !target.startsWith("@")) ??
    (targets.includes("@inbox") ? "@inbox" : undefined)
  );
}

function sameTargets(a: Observation, b: Observation) {
  return (
    [...new Set(a.targets)].sort().join("\n") ===
    [...new Set(b.targets)].sort().join("\n")
  );
}

function isAmbiguous(observation: Observation) {
  return (
    observation.targets.includes("@ambiguous") ||
    observation.targets.filter((target) => !target.startsWith("@")).length > 1
  );
}
