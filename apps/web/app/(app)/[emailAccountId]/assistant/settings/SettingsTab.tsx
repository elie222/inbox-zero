import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AboutSetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { DraftKnowledgeSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting";
import { AwaitingReplySetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AwaitingReplySetting";
import { ReferralSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/ReferralSignatureSetting";

export function SettingsTab() {
  return (
    <div className="space-y-2">
      <DraftReplies />
      <AwaitingReplySetting />
      <DraftKnowledgeSetting />
      <AboutSetting />
      <DigestSetting />
      <ReferralSignatureSetting />
    </div>
  );
}
