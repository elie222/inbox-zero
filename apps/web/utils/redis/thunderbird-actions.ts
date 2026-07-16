import { redis } from "@/utils/redis";
import { z } from "zod";

const ACTION_TTL_SECONDS = 60 * 60 * 24; // 24h
const MESSAGE_TTL_SECONDS = 60 * 60 * 6; // 6h

export const thunderbirdActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("archive"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
    folderPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("trash"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
    folderPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("bulk_archive"),
    id: z.string(),
    fromEmails: z.array(z.string().min(1)).min(1),
    accountEmail: z.string().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("bulk_trash"),
    id: z.string(),
    fromEmails: z.array(z.string().min(1)).min(1),
    accountEmail: z.string().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("mark_read"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    read: z.boolean().default(true),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("star"),
    id: z.string(),
    messageId: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("mark_spam"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
    folderPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("label"),
    id: z.string(),
    messageId: z.string(),
    labelName: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("move_folder"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    folderName: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
    folderPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("draft"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    to: z.string().optional(),
    subject: z.string().optional(),
    content: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("reply"),
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    content: z.string(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("send"),
    id: z.string(),
    to: z.string(),
    subject: z.string(),
    content: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("forward"),
    id: z.string(),
    messageId: z.string(),
    to: z.string(),
    content: z.string().optional(),
    thunderbirdMessageId: z.number().optional(),
    thunderbirdAccountId: z.string().optional(),
  }),
]);

export type ThunderbirdBridgeAction = z.infer<typeof thunderbirdActionSchema>;

export function isThunderbirdBulkAction(
  action: ThunderbirdBridgeAction,
): action is Extract<
  ThunderbirdBridgeAction,
  { type: "bulk_archive" | "bulk_trash" }
> {
  return action.type === "bulk_archive" || action.type === "bulk_trash";
}

export const thunderbirdMessageRefSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  thunderbirdMessageId: z.number(),
  thunderbirdAccountId: z.string(),
  folderPath: z.string().optional(),
  folderId: z.string().optional(),
});

export type ThunderbirdMessageRef = z.infer<typeof thunderbirdMessageRefSchema>;

function actionsKey(emailAccountId: string) {
  return `thunderbird:actions:${emailAccountId}`;
}

function messageRefKey(emailAccountId: string, messageId: string) {
  return `thunderbird:msgref:${emailAccountId}:${messageId}`;
}

function labelMapKey(emailAccountId: string) {
  return `thunderbird:labels:${emailAccountId}`;
}

export async function enqueueThunderbirdAction(
  emailAccountId: string,
  action: ThunderbirdBridgeAction,
) {
  const key = actionsKey(emailAccountId);
  await redis.rpush(key, JSON.stringify(action));
  await redis.expire(key, ACTION_TTL_SECONDS);
}

export async function listThunderbirdActions(emailAccountId: string) {
  const key = actionsKey(emailAccountId);
  const raw = await redis.lrange<string>(key, 0, -1);
  return raw
    .map((item) => {
      try {
        return thunderbirdActionSchema.parse(
          typeof item === "string" ? JSON.parse(item) : item,
        );
      } catch {
        return null;
      }
    })
    .filter((action): action is ThunderbirdBridgeAction => action !== null);
}

export async function clearThunderbirdActions(
  emailAccountId: string,
  actionIds?: string[],
) {
  const key = actionsKey(emailAccountId);
  if (!actionIds?.length) {
    await redis.del(key);
    return;
  }

  const remaining = (await listThunderbirdActions(emailAccountId)).filter(
    (action) => !actionIds.includes(action.id),
  );
  await redis.del(key);
  if (remaining.length === 0) return;

  await redis.rpush(
    key,
    ...remaining.map((action) => JSON.stringify(action)),
  );
  await redis.expire(key, ACTION_TTL_SECONDS);
}

/** Clears proposal actions but keeps bulk archive/trash jobs for the add-on. */
export async function clearThunderbirdProposalActions(emailAccountId: string) {
  const keep = (await listThunderbirdActions(emailAccountId)).filter(
    isThunderbirdBulkAction,
  );
  const key = actionsKey(emailAccountId);
  await redis.del(key);
  if (keep.length === 0) return;

  await redis.rpush(key, ...keep.map((action) => JSON.stringify(action)));
  await redis.expire(key, ACTION_TTL_SECONDS);
}

export async function saveThunderbirdMessageRef(
  emailAccountId: string,
  ref: ThunderbirdMessageRef,
) {
  const key = messageRefKey(emailAccountId, ref.messageId);
  await redis.set(key, JSON.stringify(ref), { ex: MESSAGE_TTL_SECONDS });
}

export async function getThunderbirdMessageRef(
  emailAccountId: string,
  messageId: string,
): Promise<ThunderbirdMessageRef | null> {
  const raw = await redis.get<string>(messageRefKey(emailAccountId, messageId));
  if (!raw) return null;
  try {
    return thunderbirdMessageRefSchema.parse(
      typeof raw === "string" ? JSON.parse(raw) : raw,
    );
  } catch {
    return null;
  }
}

export async function getOrCreateThunderbirdLabelId(
  emailAccountId: string,
  labelName: string,
): Promise<{ id: string; created: boolean }> {
  const key = labelMapKey(emailAccountId);
  const existing = await redis.hget<string>(key, labelName);
  if (existing) return { id: existing, created: false };

  const id = `tb-label-${Buffer.from(labelName).toString("base64url")}`;
  await redis.hset(key, { [labelName]: id });
  await redis.expire(key, ACTION_TTL_SECONDS);
  return { id, created: true };
}

export async function getThunderbirdLabelName(
  emailAccountId: string,
  labelId: string,
): Promise<string | null> {
  const key = labelMapKey(emailAccountId);
  const all = await redis.hgetall<Record<string, string>>(key);
  if (!all) return null;
  for (const [name, id] of Object.entries(all)) {
    if (id === labelId) return name;
  }
  return null;
}
