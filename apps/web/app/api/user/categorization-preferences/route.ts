import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  ActionType,
  ColdEmailSetting,
  SystemType,
  type Prisma,
} from "@prisma/client";
import type {
  CategoryAction,
  CreateRulesOnboardingBody,
} from "@/utils/actions/rule.validation";
import { RuleName } from "@/utils/rule/consts";

type CategoryConfig = {
  action: CategoryAction | undefined;
  hasDigest: boolean | undefined;
};

export type GetCategorizationPreferencesResponse = Awaited<
  ReturnType<typeof getUserPreferences>
>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getUserPreferences({ emailAccountId });
  return NextResponse.json(result);
});

type UserPreferences = Prisma.EmailAccountGetPayload<{
  select: {
    rules: {
      select: {
        systemType: true;
        actions: {
          select: { type: true };
        };
      };
    };
    coldEmailBlocker: true;
    coldEmailDigest: true;
  };
}>;

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
      coldEmailBlocker: true,
      coldEmailDigest: true,
    },
  });
  if (!emailAccount) return [];

  return [
    {
      name: RuleName.ToReply,
      ...getToReplySetting(emailAccount.rules),
    },
    {
      name: RuleName.ColdEmail,
      ...getColdEmailSetting(
        emailAccount.coldEmailBlocker,
        emailAccount.coldEmailDigest,
      ),
    },
    {
      name: RuleName.Newsletter,
      ...getRuleSetting(SystemType.NEWSLETTER, emailAccount.rules),
    },
    {
      name: RuleName.Marketing,
      ...getRuleSetting(SystemType.MARKETING, emailAccount.rules),
    },
    {
      name: RuleName.Calendar,
      ...getRuleSetting(SystemType.CALENDAR, emailAccount.rules),
    },
    {
      name: RuleName.Receipt,
      ...getRuleSetting(SystemType.RECEIPT, emailAccount.rules),
    },
    {
      name: RuleName.Notification,
      ...getRuleSetting(SystemType.NOTIFICATION, emailAccount.rules),
    },
  ];
}

function getToReplySetting(
  rules: UserPreferences["rules"],
): CategoryConfig | undefined {
  if (!rules.length) return undefined;
  const rule = rules.find((rule) =>
    rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
  );
  const replyRules = rules.find(
    (rule) => rule.systemType === SystemType.TO_REPLY,
  );
  const hasDigest = replyRules?.actions.some(
    (action) => action.type === ActionType.DIGEST,
  );

  if (rule) return { action: "label", hasDigest };
  return { action: "none", hasDigest };
}

function getRuleSetting(
  systemType: SystemType,
  rules?: UserPreferences["rules"],
): CategoryConfig | undefined {
  const rule = rules?.find((rule) => rule.systemType === systemType);
  const hasDigest = rule?.actions.some(
    (action) => action.type === ActionType.DIGEST,
  );
  if (!rule) return undefined;

  if (rule.actions.some((action) => action.type === ActionType.ARCHIVE))
    return { action: "label_archive", hasDigest };
  if (rule.actions.some((action) => action.type === ActionType.LABEL))
    return { action: "label", hasDigest };
  return { action: "none", hasDigest };
}

function getColdEmailSetting(
  setting?: ColdEmailSetting | null,
  hasDigest?: boolean,
): CategoryConfig | undefined {
  if (!setting) return undefined;

  switch (setting) {
    case ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL:
    case ColdEmailSetting.ARCHIVE_AND_LABEL:
      return { action: "label_archive", hasDigest };
    case ColdEmailSetting.LABEL:
      return { action: "label", hasDigest };
    default:
      return { action: "none", hasDigest };
  }
}
