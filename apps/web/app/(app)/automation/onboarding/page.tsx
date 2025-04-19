import { Card } from "@/components/ui/card";
import { CategoriesSetup } from "./CategoriesSetup";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import {
  ActionType,
  ColdEmailSetting,
  SystemType,
  type Prisma,
} from "@prisma/client";
import type { CategoryAction } from "@/utils/actions/rule.validation";

export default async function OnboardingPage() {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return <div>Not authenticated</div>;

  const defaultValues = await getUserPreferences({ email });

  return (
    <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <CategoriesSetup defaultValues={defaultValues} />
    </Card>
  );
}

type UserPreferences = Prisma.UserGetPayload<{
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
  email,
}: {
  email: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      user: {
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
      },
      coldEmailBlocker: true,
    },
  });
  if (!emailAccount) return undefined;

  return {
    toReply: getToReplySetting(emailAccount.user.rules),
    coldEmails: getColdEmailSetting(emailAccount.coldEmailBlocker),
    newsletter: getRuleSetting(SystemType.NEWSLETTER, emailAccount.user.rules),
    marketing: getRuleSetting(SystemType.MARKETING, emailAccount.user.rules),
    calendar: getRuleSetting(SystemType.CALENDAR, emailAccount.user.rules),
    receipt: getRuleSetting(SystemType.RECEIPT, emailAccount.user.rules),
    notification: getRuleSetting(
      SystemType.NOTIFICATION,
      emailAccount.user.rules,
    ),
  };
}

function getToReplySetting(
  rules: UserPreferences["rules"],
): CategoryAction | undefined {
  if (!rules.length) return undefined;
  const rule = rules.find((rule) =>
    rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
  );
  if (rule) return "label";
  return "none";
}

function getRuleSetting(
  systemType: SystemType,
  rules?: UserPreferences["rules"],
): CategoryAction | undefined {
  const rule = rules?.find((rule) => rule.systemType === systemType);
  if (!rule) return undefined;

  if (rule.actions.some((action) => action.type === ActionType.ARCHIVE))
    return "label_archive";
  if (rule.actions.some((action) => action.type === ActionType.LABEL))
    return "label";
  return "none";
}

function getColdEmailSetting(
  setting?: ColdEmailSetting | null,
): CategoryAction | undefined {
  if (!setting) return undefined;

  switch (setting) {
    case ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL:
    case ColdEmailSetting.ARCHIVE_AND_LABEL:
      return "label_archive";
    case ColdEmailSetting.LABEL:
      return "label";
    default:
      return "none";
  }
}
