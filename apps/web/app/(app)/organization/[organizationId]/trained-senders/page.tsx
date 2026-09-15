import { PageWrapper } from "@/components/PageWrapper";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { OrgTrainedSenders } from "@/app/(app)/organization/[organizationId]/trained-senders/OrgTrainedSenders";

export default async function OrgTrainedSendersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />
      <div className="mt-6">
        <OrgTrainedSenders organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
