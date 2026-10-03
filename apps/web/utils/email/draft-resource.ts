import { randomUUID } from "node:crypto";
import type {
  EmailDraftResource,
  ScheduledEmail,
} from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";
import { discardComposeDraft } from "@/utils/email/compose-draft";

const LEASE_MS = 2 * 60 * 1000;

type Identity = {
  accountId: string;
  resourceKey: string;
  providerDraftId?: string;
};
type Write = Identity & { content: SendEmailBody; provider: EmailProvider };

export function draftResourceResult(row: EmailDraftResource) {
  return {
    resourceKey: row.resourceKey,
    state: row.state,
    owner: row.owner,
    providerDraftId: row.providerDraftId,
    messageId: row.providerMessageId,
    threadId: row.providerThreadId,
    retryAfterMs: row.leaseId && row.state !== "UNCERTAIN" ? 1000 : null,
  };
}

/** Imported mailbox IDs have one canonical key, including across devices. */
export async function registerDraftResource(
  input: Identity,
): Promise<EmailDraftResource> {
  const existing = await findResource(input.accountId, input.resourceKey);
  if (existing) {
    if (
      input.providerDraftId &&
      existing.providerDraftId !== input.providerDraftId
    ) {
      throw new SafeError(
        "This resource belongs to a different mailbox draft.",
      );
    }
    return existing;
  }
  if (input.providerDraftId) {
    const canonical = await findProviderResource(
      input.accountId,
      input.providerDraftId,
    );
    if (canonical) return canonical;
  }
  try {
    return await prisma.emailDraftResource.create({
      data: {
        emailAccountId: input.accountId,
        resourceKey: input.resourceKey,
        ...(input.providerDraftId
          ? { providerDraftId: input.providerDraftId, state: "READY" }
          : {}),
      },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    const raced =
      (await findResource(input.accountId, input.resourceKey)) ??
      (input.providerDraftId
        ? await findProviderResource(input.accountId, input.providerDraftId)
        : null);
    if (!raced) throw error;
    if (
      input.providerDraftId &&
      raced.providerDraftId !== input.providerDraftId
    ) {
      throw new SafeError(
        "This resource belongs to a different mailbox draft.",
      );
    }
    return raced;
  }
}

export async function readDraftResource(
  accountId: string,
  resourceKey: string,
) {
  const row = await findResource(accountId, resourceKey);
  return row ? expireLease(row) : null;
}

/** POST acknowledges the durable identity before PUT uploads full recipients/files. */
export async function createDraftResource(input: Write) {
  let row = await expireLease(await registerDraftResource(input));
  if (row.owner !== "DRAFT" || row.state !== "NOT_CREATED") return row;
  const leaseId = randomUUID();
  const claimed = await prisma.emailDraftResource.updateMany({
    where: {
      id: row.id,
      canonicalResourceId: null,
      owner: "DRAFT",
      state: "NOT_CREATED",
      leaseId: null,
    },
    data: { state: "CREATING", leaseId, leaseStartedAt: new Date() },
  });
  if (!claimed.count) return current(row);
  try {
    const created = await input.provider.createDraft({
      to: "",
      subject: input.content.subject,
      messageHtml: input.content.messageHtml,
    });
    if (!created.id) throw new Error("Provider returned no draft identity");
    // Do not test desired owner here: Send/discard may have claimed the late result.
    try {
      const persisted = await prisma.emailDraftResource.updateMany({
        where: { id: row.id, canonicalResourceId: null, leaseId },
        data: {
          providerDraftId: created.id,
          state: "READY",
          leaseId: null,
          leaseStartedAt: null,
        },
      });
      if (!persisted.count)
        throw new Error("Draft identity ownership was lost");
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      const canonical = await findProviderResource(input.accountId, created.id);
      if (!canonical || !(await mergeCreatedResource(row, leaseId, canonical)))
        throw error;
    }
    row = await noteProviderMessage(await current(row), input.provider);
    if (row.owner === "DISCARD")
      return discardDraftResource({ ...input, resourceKey: row.resourceKey });
    return row;
  } catch {
    await markUncertain(row, leaseId);
    return current(row);
  }
}

export async function updateDraftResource(
  input: Write,
): Promise<EmailDraftResource> {
  let row = await expireLease(await registerDraftResource(input));
  if (row.owner !== "DRAFT" || row.state !== "READY" || !row.providerDraftId)
    return row;
  const leaseId = await claimLease(row, "DRAFT");
  if (!leaseId) {
    const latest = await current(row);
    return latest.id !== row.id
      ? updateDraftResource({ ...input, resourceKey: latest.resourceKey })
      : latest;
  }
  try {
    await input.provider.updateDraft(row.providerDraftId, {
      to: input.content.to,
      cc: input.content.cc ?? "",
      bcc: input.content.bcc ?? "",
      subject: input.content.subject,
      messageHtml: input.content.messageHtml,
      attachments: input.content.attachments ?? [],
    });
    await releaseLease(row, leaseId, "READY");
    row = await noteProviderMessage(await current(row), input.provider);
    if (row.owner === "DISCARD")
      return discardDraftResource({ ...input, resourceKey: row.resourceKey });
    return row;
  } catch {
    await markUncertain(row, leaseId);
    return current(row);
  }
}

/** Discard owns the future result even when creation is currently in flight. */
export async function discardDraftResource(
  input: Identity & { provider: EmailProvider },
): Promise<EmailDraftResource> {
  let row = await expireLease(await registerDraftResource(input));
  if (row.owner === "SEND" || row.state === "CONSUMED") return row;
  await prisma.emailDraftResource.updateMany({
    where: { id: row.id, canonicalResourceId: null, owner: "DRAFT" },
    data: { owner: "DISCARD" },
  });
  const latest = await current(row);
  if (latest.id !== row.id)
    return discardDraftResource({ ...input, resourceKey: latest.resourceKey });
  row = latest;
  if (row.owner !== "DISCARD" || row.state === "UNCERTAIN" || row.leaseId)
    return row;
  const leaseId = await claimLease(row, "DISCARD");
  if (!leaseId) return current(row);
  try {
    if (row.providerDraftId)
      await discardComposeDraft({
        provider: input.provider,
        draftId: row.providerDraftId,
      });
    await releaseLease(row, leaseId, "CONSUMED");
  } catch {
    await markUncertain(row, leaseId);
  }
  return current(row);
}

/** Server admission owns the resource; native admission never awaits this HTTP step. */
export async function claimDraftResourceForSend(
  input: Identity & { sendOperationId: string },
): Promise<{
  status: "rejected" | "uncertain" | "retry" | "ready";
  resource: EmailDraftResource;
}> {
  let row = await expireLease(await registerDraftResource(input));
  if (row.owner === "DRAFT" && row.state !== "CONSUMED") {
    await prisma.emailDraftResource.updateMany({
      where: { id: row.id, canonicalResourceId: null, owner: "DRAFT" },
      data: { owner: "SEND", sendOperationId: input.sendOperationId },
    });
    const latest = await current(row);
    if (latest.id !== row.id)
      return claimDraftResourceForSend({
        ...input,
        resourceKey: latest.resourceKey,
      });
    row = latest;
  }
  if (row.owner !== "SEND" || row.sendOperationId !== input.sendOperationId) {
    return { status: "rejected" as const, resource: row };
  }
  if (row.state === "UNCERTAIN")
    return { status: "uncertain" as const, resource: row };
  if (row.leaseId || row.state === "CREATING")
    return { status: "retry" as const, resource: row };
  return { status: "ready" as const, resource: row };
}

export async function leaseDraftResourceForSend(
  input: Identity & { sendOperationId: string },
) {
  const claimed = await claimDraftResourceForSend(input);
  if (claimed.status !== "ready" || claimed.resource.state === "CONSUMED")
    return claimed;
  const leaseId = await claimLease(
    claimed.resource,
    "SEND",
    input.sendOperationId,
  );
  return leaseId
    ? { ...claimed, leaseId }
    : { status: "retry" as const, resource: await current(claimed.resource) };
}

export async function finishDraftResourceSend(
  row: EmailDraftResource,
  leaseId: string,
  outcome: "sent" | "uncertain" | "unsent",
) {
  if (outcome === "uncertain") return markUncertain(row, leaseId);
  if (outcome === "unsent") {
    const released = await prisma.emailDraftResource.updateMany({
      where: {
        id: row.id,
        canonicalResourceId: null,
        leaseId,
        owner: "SEND",
        sendOperationId: row.sendOperationId,
      },
      data: {
        owner: "DRAFT",
        sendOperationId: null,
        leaseId: null,
        leaseStartedAt: null,
        state: row.providerDraftId ? "READY" : "NOT_CREATED",
      },
    });
    if (!released.count) throw new Error("Draft send ownership was lost");
    return;
  }
  return releaseLease(row, leaseId, "CONSUMED");
}

export async function releaseKnownUnsentDraftResource(
  accountId: string,
  sendOperationId: string,
) {
  await prisma.emailDraftResource.updateMany({
    where: {
      emailAccountId: accountId,
      canonicalResourceId: null,
      owner: "SEND",
      sendOperationId,
      leaseId: null,
      state: { in: ["NOT_CREATED", "READY"] },
    },
    data: { owner: "DRAFT", sendOperationId: null },
  });
}

/** The scheduled row and its desired draft owner commit together, including an undo hold. */
export async function admitScheduledDraftResource(
  input: Identity & {
    sendOperationId: string;
    payloadHash: string;
    payload: unknown;
    threadId: string | null;
    sendAt: Date;
    remindAt: Date | null;
    heldForUndo: boolean;
  },
): Promise<ScheduledEmail | null> {
  let root = await registerDraftResource(input);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rows = await prisma.$queryRaw<ScheduledEmail[]>`
      WITH resource AS (
        SELECT "id" FROM "EmailDraftResource" WHERE "id" = ${root.id} AND "emailAccountId" = ${input.accountId}
          AND "canonicalResourceId" IS NULL AND "state" <> 'CONSUMED'
          AND ("owner" = 'DRAFT' OR ("owner" = 'SEND' AND "sendOperationId" = ${input.sendOperationId}))
        FOR UPDATE
      ), scheduled AS (
        INSERT INTO "ScheduledEmail" ("id", "createdAt", "updatedAt", "emailAccountId", "clientMutationId",
          "payloadHash", "payload", "threadId", "sendAt", "remindAt", "reminderStatus", "heldForUndo")
        SELECT ${randomUUID()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${input.accountId}, ${input.sendOperationId},
          ${input.payloadHash}, ${JSON.stringify(input.payload)}::jsonb, ${input.threadId}, ${input.sendAt}, ${input.remindAt},
          CASE WHEN ${input.remindAt}::timestamp IS NULL THEN 'NONE'::"EmailReminderStatus" ELSE 'PENDING'::"EmailReminderStatus" END,
          ${input.heldForUndo} FROM resource
        ON CONFLICT ("emailAccountId", "clientMutationId") DO NOTHING RETURNING *
      ), owned AS (
        UPDATE "EmailDraftResource" draft SET "owner" = 'SEND', "sendOperationId" = ${input.sendOperationId},
          "updatedAt" = CURRENT_TIMESTAMP FROM resource, scheduled WHERE draft."id" = resource."id" RETURNING draft."id"
      ) SELECT scheduled.* FROM scheduled, owned
    `;
    if (rows[0]) return rows[0];
    const latest = await current(root);
    if (latest.id === root.id) return null;
    root = latest;
  }
  return null;
}

/** A persisted send result is authoritative even if its resource completion write failed. */
export async function reconcileSentDraftResource(
  accountId: string,
  sendOperationId: string,
) {
  await prisma.emailDraftResource.updateMany({
    where: {
      emailAccountId: accountId,
      canonicalResourceId: null,
      owner: "SEND",
      sendOperationId,
    },
    data: { state: "CONSUMED", leaseId: null, leaseStartedAt: null },
  });
}

/** Called only after a durable held-send cancellation has won its own CAS. */
export async function releaseCancelledDraftResource(
  accountId: string,
  sendOperationId: string,
) {
  await prisma.emailDraftResource.updateMany({
    where: {
      emailAccountId: accountId,
      canonicalResourceId: null,
      owner: "SEND",
      sendOperationId,
      state: { in: ["NOT_CREATED", "CREATING", "READY", "UNCERTAIN"] },
    },
    data: { owner: "DRAFT", sendOperationId: null },
  });
}

async function findResource(accountId: string, resourceKey: string) {
  const row = await prisma.emailDraftResource.findUnique({
    where: {
      emailAccountId_resourceKey: { emailAccountId: accountId, resourceKey },
    },
  });
  return row ? resolveResource(row) : null;
}

async function findProviderResource(
  accountId: string,
  providerDraftId: string,
) {
  return prisma.emailDraftResource.findUnique({
    where: {
      emailAccountId_providerDraftId: {
        emailAccountId: accountId,
        providerDraftId,
      },
    },
  });
}

async function current(row: EmailDraftResource) {
  const found = await prisma.emailDraftResource.findUnique({
    where: { id: row.id },
  });
  if (!found) throw new SafeError("This draft resource no longer exists.");
  return resolveResource(found);
}

async function resolveResource(
  row: EmailDraftResource,
): Promise<EmailDraftResource> {
  if (!row.canonicalResourceId) return row;
  const root = await prisma.emailDraftResource.findUnique({
    where: { id: row.canonicalResourceId },
  });
  if (
    !root ||
    root.emailAccountId !== row.emailAccountId ||
    root.id === row.id ||
    root.canonicalResourceId
  )
    throw new SafeError("Draft resource ownership needs recovery.");
  return root;
}

/** One statement locks current owners and freezes the old key before any competing claim resumes. */
async function mergeCreatedResource(
  source: EmailDraftResource,
  leaseId: string,
  canonical: EmailDraftResource,
) {
  const changed = await prisma.$executeRaw`
    WITH source AS (
      SELECT * FROM "EmailDraftResource" WHERE "id" = ${source.id} AND "leaseId" = ${leaseId}
        AND "emailAccountId" = ${source.emailAccountId} AND "canonicalResourceId" IS NULL AND "providerDraftId" IS NULL
      FOR UPDATE
    ), adopted AS (
      UPDATE "EmailDraftResource" root
      SET "owner" = CASE WHEN root."owner" = 'DRAFT' THEN source."owner" ELSE root."owner" END,
          "sendOperationId" = CASE WHEN root."owner" = 'DRAFT' THEN source."sendOperationId" ELSE root."sendOperationId" END,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM source WHERE root."id" = ${canonical.id} AND root."emailAccountId" = source."emailAccountId"
        AND root."providerDraftId" = ${canonical.providerDraftId} AND root."canonicalResourceId" IS NULL
      RETURNING root."id"
    )
    UPDATE "EmailDraftResource" original SET "canonicalResourceId" = adopted."id", "state" = 'CONSUMED',
      "leaseId" = NULL, "leaseStartedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    FROM adopted, source WHERE original."id" = source."id"
  `;
  return changed === 1;
}

async function expireLease(row: EmailDraftResource) {
  if (
    !row.leaseStartedAt ||
    row.leaseStartedAt.getTime() > Date.now() - LEASE_MS
  )
    return row;
  if (row.state === "UNCERTAIN") return current(row);
  await prisma.emailDraftResource.updateMany({
    where: {
      id: row.id,
      canonicalResourceId: null,
      leaseId: row.leaseId,
      leaseStartedAt: { lte: new Date(Date.now() - LEASE_MS) },
      state: { in: ["NOT_CREATED", "CREATING", "READY"] },
    },
    data: { state: "UNCERTAIN" },
  });
  return current(row);
}

async function claimLease(
  row: EmailDraftResource,
  owner: "DRAFT" | "SEND" | "DISCARD",
  sendOperationId?: string,
) {
  const leaseId = randomUUID();
  const claimed = await prisma.emailDraftResource.updateMany({
    where: {
      id: row.id,
      canonicalResourceId: null,
      owner,
      leaseId: null,
      state: { in: ["READY", "NOT_CREATED"] },
      ...(sendOperationId ? { sendOperationId } : {}),
    },
    data: { leaseId, leaseStartedAt: new Date() },
  });
  return claimed.count ? leaseId : null;
}

async function releaseLease(
  row: EmailDraftResource,
  leaseId: string,
  state: "READY" | "NOT_CREATED" | "CONSUMED",
) {
  const changed = await prisma.emailDraftResource.updateMany({
    where: { id: row.id, canonicalResourceId: null, leaseId },
    data: { state, leaseId: null, leaseStartedAt: null },
  });
  if (!changed.count) throw new Error("Draft resource lease was lost");
}

async function markUncertain(row: EmailDraftResource, leaseId: string) {
  // Keep the lease token: a still-running request can record its actual late result.
  await prisma.emailDraftResource.updateMany({
    where: { id: row.id, canonicalResourceId: null, leaseId },
    data: { state: "UNCERTAIN" },
  });
}

async function noteProviderMessage(
  row: EmailDraftResource,
  provider: EmailProvider,
) {
  if (!row.providerDraftId) return row;
  const message = await provider
    .getDraft(row.providerDraftId)
    .catch(() => null);
  if (message)
    await prisma.emailDraftResource.updateMany({
      where: {
        id: row.id,
        canonicalResourceId: null,
        providerDraftId: row.providerDraftId,
      },
      data: {
        providerMessageId: message.id,
        providerThreadId: message.threadId ?? null,
      },
    });
  return current(row);
}
