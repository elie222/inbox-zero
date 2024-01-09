import { ColdEmailList } from "@/app/(app)/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";
import { TopSection } from "@/components/TopSection";

export default function ColdEmailBlockerPage() {
  return (
    <div>
      <TopSection title="Cold Email Blocker" />
      <div className="border-b border-gray-200 bg-white px-4 py-6 shadow-sm sm:px-6 lg:px-8">
        <ColdEmailSettings />
      </div>
      <ColdEmailList />
    </div>
  );
}
