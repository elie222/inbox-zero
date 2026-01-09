import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AboutSetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { DraftKnowledgeSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting";
import { ReferralSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ReferralSignatureSetting";
import { LearnedPatternsSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/LearnedPatternsSetting";
import { PersonalSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting";
import { MultiRuleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/MultiRuleSetting";
import { WritingStyleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/WritingStyleSetting";
import { env } from "@/env";

export function SettingsTab() {
  return (
    <div className="space-y-2">
      <DraftReplies />
      <AboutSetting />
      <WritingStyleSetting />
      <PersonalSignatureSetting />
      <DraftKnowledgeSetting />
      <MultiRuleSetting />
      {env.NEXT_PUBLIC_DIGEST_ENABLED && <DigestSetting />}
      <ReferralSignatureSetting />
      <LearnedPatternsSetting />
    </div>
  );
}
