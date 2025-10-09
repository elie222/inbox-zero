import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ActionType, SystemType, type Prisma } from "@prisma/client";
import type {
  CategoryAction,
  CreateRulesOnboardingBody,
} from "@/utils/actions/rule.validation";
import { getRuleName } from "@/utils/rule/consts";

type CategoryConfig = {
  action: CategoryAction | undefined;
  hasDigest: boolean | undefined;
};

type EmailAccountPreferences = Prisma.EmailAccountGetPayload<{
  select: {
    rules: {
      select: {
        systemType: true;
        actions: {
          select: { type: true };
        };
      };
    };
  };
}>;

export type GetCategorizationPreferencesResponse = Awaited<
  ReturnType<typeof getUserPreferences>
>;

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getUserPreferences({ emailAccountId });
  return NextResponse.json(result);
});

async function getUserPreferences({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<CreateRulesOnboardingBody> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      rules: {
        select: {
          systemType: true,
          actions: {
            select: {
              type: true,
            },
          },
        },
      },
    },
  });
  if (!emailAccount) return [];

  return [
    {
      name: getRuleName(SystemType.TO_REPLY),
      key: SystemType.TO_REPLY,
      description: "",
      ...getRuleSetting(SystemType.TO_REPLY, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.COLD_EMAIL),
      key: SystemType.COLD_EMAIL,
      description: "",
      ...getRuleSetting(SystemType.COLD_EMAIL, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.NEWSLETTER),
      key: SystemType.NEWSLETTER,
      description: "",
      ...getRuleSetting(SystemType.NEWSLETTER, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.MARKETING),
      key: SystemType.MARKETING,
      description: "",
      ...getRuleSetting(SystemType.MARKETING, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.CALENDAR),
      key: SystemType.CALENDAR,
      description: "",
      ...getRuleSetting(SystemType.CALENDAR, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.RECEIPT),
      key: SystemType.RECEIPT,
      description: "",
      ...getRuleSetting(SystemType.RECEIPT, emailAccount.rules),
    },
    {
      name: getRuleName(SystemType.NOTIFICATION),
      key: SystemType.NOTIFICATION,
      description: "",
      ...getRuleSetting(SystemType.NOTIFICATION, emailAccount.rules),
    },
  ];
}

function getRuleSetting(
  systemType: SystemType,
  rules?: EmailAccountPreferences["rules"],
): CategoryConfig | undefined {
  const rule = rules?.find((rule) => rule.systemType === systemType);
  const hasDigest = rule?.actions.some(
    (action) => action.type === ActionType.DIGEST,
  );
  if (!rule) return undefined;

  if (rule.actions.some((action) => action.type === ActionType.MOVE_FOLDER))
    return { action: "move_folder", hasDigest };
  if (rule.actions.some((action) => action.type === ActionType.ARCHIVE))
    return { action: "label_archive", hasDigest };
  if (rule.actions.some((action) => action.type === ActionType.LABEL))
    return { action: "label", hasDigest };
  return { action: "none", hasDigest };
}
