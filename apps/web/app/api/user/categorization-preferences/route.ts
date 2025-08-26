import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
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
import { RuleName, SystemRule } from "@/utils/rule/consts";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

type CategoryConfig = {
  action: CategoryAction | undefined;
  hasDigest: boolean | undefined;
};

export type GetCategorizationPreferencesResponse = Awaited<
  ReturnType<typeof getUserPreferences>
>;

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const { emailProvider } = request;

  const result = await getUserPreferences({
    emailAccountId,
    provider: emailProvider.name,
  });
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
  provider,
}: {
  emailAccountId: string;
  provider: string;
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
      key: SystemRule.ToReply,
      description: "",
      ...getToReplySetting(emailAccount.rules),
    },
    {
      name: RuleName.ColdEmail,
      key: SystemRule.ColdEmail,
      description: "",
      ...getColdEmailSetting(
        provider,
        emailAccount.coldEmailBlocker,
        emailAccount.coldEmailDigest,
      ),
    },
    {
      name: RuleName.Newsletter,
      key: SystemRule.Newsletter,
      description: "",
      ...getRuleSetting(SystemType.NEWSLETTER, emailAccount.rules),
    },
    {
      name: RuleName.Marketing,
      key: SystemRule.Marketing,
      description: "",
      ...getRuleSetting(SystemType.MARKETING, emailAccount.rules),
    },
    {
      name: RuleName.Calendar,
      key: SystemRule.Calendar,
      description: "",
      ...getRuleSetting(SystemType.CALENDAR, emailAccount.rules),
    },
    {
      name: RuleName.Receipt,
      key: SystemRule.Receipt,
      description: "",
      ...getRuleSetting(SystemType.RECEIPT, emailAccount.rules),
    },
    {
      name: RuleName.Notification,
      key: SystemRule.Notification,
      description: "",
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

  if (rule.actions.some((action) => action.type === ActionType.MOVE_FOLDER))
    return { action: "move_folder", hasDigest };
  if (rule.actions.some((action) => action.type === ActionType.ARCHIVE))
    return { action: "label_archive", hasDigest };
  if (rule.actions.some((action) => action.type === ActionType.LABEL))
    return { action: "label", hasDigest };
  return { action: "none", hasDigest };
}

function getColdEmailSetting(
  provider: string,
  setting?: ColdEmailSetting | null,
  hasDigest?: boolean,
): CategoryConfig | undefined {
  if (!setting) return undefined;

  switch (setting) {
    case ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL:
    case ColdEmailSetting.ARCHIVE_AND_LABEL:
      if (isMicrosoftProvider(provider))
        return { action: "move_folder", hasDigest };
      return { action: "label_archive", hasDigest };
    case ColdEmailSetting.LABEL:
      return { action: "label", hasDigest };
    default:
      return { action: "none", hasDigest };
  }
}
