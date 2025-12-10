import { PageWrapper } from "@/components/PageWrapper";
import { OrgStats } from "@/app/(app)/organization/[organizationId]/stats/OrgStats";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";

export default async function OrgStatsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />

      <div className="mt-6">
        <OrgStats organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
