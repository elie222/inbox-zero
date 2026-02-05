import prisma from "@/utils/prisma";
import { validateConditions } from "@/utils/ai/agent/validation/schemas";
import { Prisma } from "@/generated/prisma/client";

export type TargetGroupInput = {
  name: string;
  cardinality: "SINGLE" | "MULTI";
  appliesToResourceType?: string | null;
};

export type AllowedActionInput = {
  actionType: string;
  resourceType?: string | null;
  enabled?: boolean;
  config?: unknown;
  conditions?: unknown;
};

export type AllowedActionOptionInput = {
  actionType: string;
  resourceType?: string | null;
  provider: string;
  kind: string;
  externalId?: string | null;
  name: string;
  targetGroup?: TargetGroupInput;
  delete?: boolean;
};

export type SettingsUpdatePayload = {
  allowedActions?: AllowedActionInput[];
  allowedActionOptions?: AllowedActionOptionInput[];
};

export async function applySettingsUpdate({
  emailAccountId,
  payload,
}: {
  emailAccountId: string;
  payload: SettingsUpdatePayload;
}) {
  if (payload.allowedActions?.length) {
    const prepared = payload.allowedActions.map((action) => ({
      ...action,
      conditions: normalizeConditions(action.conditions),
    }));

    await Promise.all(
      prepared.map((action) =>
        upsertAllowedAction({
          emailAccountId,
          actionType: action.actionType,
          resourceType: action.resourceType ?? null,
          enabled: action.enabled ?? true,
          config: action.config,
          conditions: action.conditions,
        }),
      ),
    );
  }

  if (payload.allowedActionOptions?.length) {
    for (const option of payload.allowedActionOptions) {
      if (option.delete) {
        await deleteAllowedActionOption({ emailAccountId, option });
        continue;
      }

      const targetGroupId = option.targetGroup
        ? await upsertTargetGroup({
            emailAccountId,
            targetGroup: option.targetGroup,
          })
        : null;

      await upsertAllowedActionOption({
        emailAccountId,
        option,
        targetGroupId,
      });
    }
  }
}

function normalizeConditions(conditions?: unknown) {
  if (conditions === undefined) return undefined;
  if (conditions === null) return null;
  return validateConditions(conditions);
}

async function upsertAllowedAction({
  emailAccountId,
  actionType,
  resourceType,
  enabled,
  config,
  conditions,
}: {
  emailAccountId: string;
  actionType: string;
  resourceType: string | null;
  enabled: boolean;
  config?: unknown;
  conditions?: unknown;
}) {
  const where = {
    emailAccountId,
    actionType,
    resourceType,
  } satisfies Prisma.AllowedActionWhereInput;
  const payload = {
    enabled,
    config: toInputJsonValue(config),
    conditions: toInputJsonValue(conditions),
  } satisfies Pick<
    Prisma.AllowedActionUncheckedCreateInput,
    "enabled" | "config" | "conditions"
  >;

  const existing = await prisma.allowedAction.findFirst({
    where,
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const saved = existing
    ? await prisma.allowedAction.update({
        where: { id: existing.id },
        data: payload,
      })
    : await prisma.allowedAction.create({
        data: {
          ...where,
          ...payload,
        },
      });

  await prisma.allowedAction.deleteMany({
    where: {
      ...where,
      NOT: { id: saved.id },
    },
  });

  return saved;
}

async function upsertTargetGroup({
  emailAccountId,
  targetGroup,
}: {
  emailAccountId: string;
  targetGroup: TargetGroupInput;
}) {
  const result = await prisma.targetGroup.upsert({
    where: {
      emailAccountId_name: {
        emailAccountId,
        name: targetGroup.name,
      },
    },
    create: {
      emailAccountId,
      name: targetGroup.name,
      cardinality: targetGroup.cardinality,
      appliesToResourceType: targetGroup.appliesToResourceType ?? null,
    },
    update: {
      cardinality: targetGroup.cardinality,
      appliesToResourceType: targetGroup.appliesToResourceType ?? null,
    },
  });

  return result.id;
}

async function upsertAllowedActionOption({
  emailAccountId,
  option,
  targetGroupId,
}: {
  emailAccountId: string;
  option: AllowedActionOptionInput;
  targetGroupId: string | null;
}) {
  const resourceType = option.resourceType ?? null;
  const externalId = option.externalId ?? null;

  if (externalId) {
    const where = {
      emailAccountId,
      actionType: option.actionType,
      resourceType,
      provider: option.provider,
      kind: option.kind,
      externalId,
    } satisfies Prisma.AllowedActionOptionWhereInput;

    const existing = await prisma.allowedActionOption.findFirst({
      where,
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const saved = existing
      ? await prisma.allowedActionOption.update({
          where: { id: existing.id },
          data: {
            name: option.name,
            targetGroupId,
          },
        })
      : await prisma.allowedActionOption.create({
          data: {
            ...where,
            name: option.name,
            targetGroupId,
          },
        });

    await prisma.allowedActionOption.deleteMany({
      where: {
        ...where,
        NOT: { id: saved.id },
      },
    });

    return saved;
  }

  const where = {
    emailAccountId,
    actionType: option.actionType,
    resourceType,
    provider: option.provider,
    kind: option.kind,
    name: option.name,
    externalId: null,
  } satisfies Prisma.AllowedActionOptionWhereInput;

  const existing = await prisma.allowedActionOption.findFirst({
    where,
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const saved = existing
    ? await prisma.allowedActionOption.update({
        where: { id: existing.id },
        data: { targetGroupId },
      })
    : await prisma.allowedActionOption.create({
        data: {
          ...where,
          targetGroupId,
        },
      });

  await prisma.allowedActionOption.deleteMany({
    where: {
      ...where,
      NOT: { id: saved.id },
    },
  });

  return saved;
}

function toInputJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

async function deleteAllowedActionOption({
  emailAccountId,
  option,
}: {
  emailAccountId: string;
  option: AllowedActionOptionInput;
}) {
  const resourceType = option.resourceType ?? null;
  const externalId = option.externalId ?? null;

  if (externalId) {
    await prisma.allowedActionOption.deleteMany({
      where: {
        emailAccountId,
        actionType: option.actionType,
        resourceType,
        provider: option.provider,
        kind: option.kind,
        externalId,
      },
    });
    return;
  }

  await prisma.allowedActionOption.deleteMany({
    where: {
      emailAccountId,
      actionType: option.actionType,
      resourceType,
      provider: option.provider,
      kind: option.kind,
      name: option.name,
    },
  });
}
