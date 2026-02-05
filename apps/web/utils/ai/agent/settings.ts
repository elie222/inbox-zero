import prisma from "@/utils/prisma";
import { validateConditions } from "@/utils/ai/agent/validation/schemas";

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
  return prisma.allowedAction.upsert({
    where: {
      emailAccountId_resourceType_actionType: {
        emailAccountId,
        resourceType,
        actionType,
      },
    },
    create: {
      emailAccountId,
      resourceType,
      actionType,
      enabled,
      config: config ?? undefined,
      conditions: conditions ?? undefined,
    },
    update: {
      enabled,
      config: config ?? undefined,
      conditions: conditions ?? undefined,
    },
  });
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
    return prisma.allowedActionOption.upsert({
      where: {
        AAO_email_action_resource_provider_kind_ext_key: {
          emailAccountId,
          actionType: option.actionType,
          resourceType,
          provider: option.provider,
          kind: option.kind,
          externalId,
        },
      },
      create: {
        emailAccountId,
        actionType: option.actionType,
        resourceType,
        provider: option.provider,
        kind: option.kind,
        externalId,
        name: option.name,
        targetGroupId,
      },
      update: {
        name: option.name,
        targetGroupId,
      },
    });
  }

  return prisma.allowedActionOption.upsert({
    where: {
      AAO_email_action_resource_provider_kind_name_key: {
        emailAccountId,
        actionType: option.actionType,
        resourceType,
        provider: option.provider,
        kind: option.kind,
        name: option.name,
      },
    },
    create: {
      emailAccountId,
      actionType: option.actionType,
      resourceType,
      provider: option.provider,
      kind: option.kind,
      externalId: null,
      name: option.name,
      targetGroupId,
    },
    update: {
      targetGroupId,
    },
  });
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
