import type { createSearchIndexClient } from "./search-index-client";
import { readSearchIndexThreadPage } from "./search-index-source";
import {
  acknowledgeSearchIndexWork,
  blockSearchIndexWork,
  advanceSearchIndexWork,
  readSearchIndexWork,
} from "./search-index-work";

export async function drainSearchIndexWork(
  client: Pick<ReturnType<typeof createSearchIndexClient>, "request">,
  emailAccountId: string,
) {
  const batch = await readSearchIndexWork(emailAccountId);
  if (!batch) return { status: "stale" as const };
  if (!batch.work.length)
    return {
      status: "ready" as const,
      hasMore: false,
      blockedCount: batch.blockedCount,
    };
  const scope = { emailAccountId, generation: batch.generation };
  const state = await client.request(scope, {
    command: "state",
    emailAccountId,
  });
  if ("error" in state) return { status: state.error };
  let revision = 0;
  const stored =
    state.result &&
    typeof state.result === "object" &&
    "generation" in state.result
      ? state.result
      : null;
  if (stored?.generation === scope.generation) {
    revision = stored.revision;
  } else {
    const reset = await client.request(scope, {
      command: "reset",
      request: { ...scope, expectedGeneration: stored?.generation ?? null },
    });
    if ("error" in reset) return { status: reset.error };
    if (reset.result !== true) return { status: "stale" as const };
  }
  const item = batch.work[0];
  const replacement = await client.request(scope, {
    command: "replacementState",
    emailAccountId,
    threadId: item.threadId,
  });
  if ("error" in replacement) return { status: replacement.error };
  const resuming =
    replacement.result &&
    typeof replacement.result === "object" &&
    "token" in replacement.result &&
    replacement.result.token === item.token;
  let afterMessageId = resuming ? item.afterMessageId : undefined;
  let phase: "start" | "continue" = resuming ? "continue" : "start";
  // Yield between small batches so search requests can share the worker.
  for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
    const page = await readSearchIndexThreadPage({
      ...scope,
      threadId: item.threadId,
      token: item.token,
      afterMessageId,
    });
    if (!page) return { status: "stale" as const };
    const applied = await client.request(scope, {
      command: "apply",
      request: {
        ...scope,
        expectedRevision: revision,
        revision: revision + 1,
        upserts: page.messages,
        deletes: [],
        replacement: { threadId: item.threadId, token: item.token, phase },
      },
    });
    if ("error" in applied) {
      if (
        ![
          "document-too-large",
          "timestamp-out-of-range",
          "timestamp-slots-exhausted",
        ].includes(applied.error)
      )
        return { status: applied.error };
      if (
        !(await blockSearchIndexWork({
          ...scope,
          threadId: item.threadId,
          token: item.token,
          errorCode: applied.error,
        }))
      )
        return { status: "stale" as const };
      const remaining = await readSearchIndexWork(emailAccountId);
      return {
        status: "ready" as const,
        hasMore: !!remaining?.work.length,
        blockedCount: remaining?.blockedCount ?? 0,
      };
    }
    if (applied.result !== true) return { status: "stale" as const };
    revision++;
    phase = "continue";
    if (!page.nextMessageId) {
      const finished = await client.request(scope, {
        command: "apply",
        request: {
          ...scope,
          expectedRevision: revision,
          revision: revision + 1,
          upserts: [],
          deletes: [],
          replacement: {
            threadId: item.threadId,
            token: item.token,
            phase: "finish",
          },
        },
      });
      if ("error" in finished) return { status: finished.error };
      if (finished.result !== true) return { status: "stale" as const };
      if (!(await acknowledgeSearchIndexWork({ ...scope, work: [item] })))
        return { status: "stale" as const };
      return {
        status: "ready" as const,
        hasMore: !!(await readSearchIndexWork(emailAccountId))?.work.length,
        blockedCount:
          (await readSearchIndexWork(emailAccountId))?.blockedCount ?? 0,
      };
    }
    if (
      !(await advanceSearchIndexWork({
        ...scope,
        threadId: item.threadId,
        token: item.token,
        afterMessageId: page.nextMessageId,
      }))
    )
      return { status: "stale" as const };
    afterMessageId = page.nextMessageId;
  }
  return {
    status: "ready" as const,
    hasMore: true,
    blockedCount: batch.blockedCount,
  };
}
