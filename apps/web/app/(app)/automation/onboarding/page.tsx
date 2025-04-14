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
  if (!session?.user.id) return <div>Not authenticated</div>;

  const defaultValues = await getUserPreferences(session.user.id);

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

async function getUserPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    },
  });
  if (!user) return undefined;

  return {
    toReply: getToReplySetting(user.rules),
    coldEmails: getColdEmailSetting(user.coldEmailBlocker),
    newsletter: getRuleSetting(SystemType.NEWSLETTER, user.rules),
    marketing: getRuleSetting(SystemType.MARKETING, user.rules),
    calendar: getRuleSetting(SystemType.CALENDAR, user.rules),
    receipt: getRuleSetting(SystemType.RECEIPT, user.rules),
    notification: getRuleSetting(SystemType.NOTIFICATION, user.rules),
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
