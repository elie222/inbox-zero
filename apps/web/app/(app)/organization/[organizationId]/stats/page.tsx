import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { OrgStats } from "@/app/(app)/organization/[organizationId]/stats/OrgStats";

export default async function OrgStatsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <PageHeader title="Organization Analytics" />

      <div className="mt-4">
        <OrgStats organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
