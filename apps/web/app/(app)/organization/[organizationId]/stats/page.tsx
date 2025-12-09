import { PageWrapper } from "@/components/PageWrapper";
import { OrgStats } from "@/app/(app)/organization/[organizationId]/stats/OrgStats";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import prisma from "@/utils/prisma";

export default async function OrgStatsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  return (
    <PageWrapper>
      <OrganizationTabs
        organizationId={organizationId}
        organizationName={organization?.name}
      />

      <div className="mt-6">
        <OrgStats organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
