import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/AboutSetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/DigestSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/DraftReplies";

export function SettingsTab() {
  return (
    <div className="space-y-2">
      <DraftReplies />
      <AboutSetting />
      <DigestSetting />
    </div>
  );
}
