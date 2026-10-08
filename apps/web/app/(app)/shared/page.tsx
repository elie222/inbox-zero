import { PageWrapper } from "@/components/PageWrapper";
import { SharedConversationList } from "@/app/(app)/shared/SharedConversationList";
import { SharedTabs } from "@/app/(app)/shared/SharedTabs";

export default function SharedPage() {
  return (
    <PageWrapper>
      <SharedTabs />
      <div className="mt-6">
        <SharedConversationList />
      </div>
    </PageWrapper>
  );
}
