import { Card } from "@/components/ui/card";
import { CategoriesSetup } from "./CategoriesSetup";
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

type CategoryConfig = {
  action: CategoryAction | undefined;
  hasDigest: boolean | undefined;
};

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  const defaultValues = await getUserPreferences({ emailAccountId });

  return (
    <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <CategoriesSetup
        emailAccountId={emailAccountId}
        defaultValues={defaultValues}
      />
    </Card>
  );
}

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
  };
}>;

async function getUserPreferences({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<Partial<CreateRulesOnboardingBody> | undefined> {
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
  if (!emailAccount) return undefined;

  return {
    toReply: getToReplySetting(SystemType.TO_REPLY, emailAccount.rules),
    coldEmail: getColdEmailSetting(
      emailAccount.coldEmailBlocker,
      emailAccount.coldEmailDigest,
    ),
    newsletter: getRuleSetting(SystemType.NEWSLETTER, emailAccount.rules),
    marketing: getRuleSetting(SystemType.MARKETING, emailAccount.rules),
    calendar: getRuleSetting(SystemType.CALENDAR, emailAccount.rules),
    receipt: getRuleSetting(SystemType.RECEIPT, emailAccount.rules),
    notification: getRuleSetting(SystemType.NOTIFICATION, emailAccount.rules),
  };
}

function getToReplySetting(
  systemType: SystemType,
  rules: UserPreferences["rules"],
): CategoryConfig | undefined {
  if (!rules.length) return undefined;
  const rule = rules.find((rule) =>
    rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
  );
  const replyRules = rules.find((rule) => rule.systemType === systemType);
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
