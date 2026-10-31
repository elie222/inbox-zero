import { PageWrapper } from "@/components/PageWrapper";
import { ConversationActivity } from "@/app/(app)/shared/activity/ConversationActivity";
import { SharedTabs } from "@/app/(app)/shared/SharedTabs";

export default function SharedActivityPage() {
  return (
    <PageWrapper>
      <SharedTabs />
      <div className="mt-6">
        <ConversationActivity />
      </div>
    </PageWrapper>
  );
}
