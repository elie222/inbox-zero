import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AboutSetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { DraftKnowledgeSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting";
import { AwaitingReplySetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AwaitingReplySetting";
import { ReferralSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ReferralSignatureSetting";
import { LearnedPatternsSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/LearnedPatternsSetting";
import { PersonalSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting";

export function SettingsTab() {
  return (
    <div className="space-y-2">
      <DraftReplies />
      <AwaitingReplySetting />
      <DraftKnowledgeSetting />
      <AboutSetting />
      <DigestSetting />
      <PersonalSignatureSetting />
      <ReferralSignatureSetting />
      <LearnedPatternsSetting />
    </div>
  );
}
