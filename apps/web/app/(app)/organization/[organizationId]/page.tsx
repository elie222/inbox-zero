import { Members } from "@/app/(app)/organization/[organizationId]/Members";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { PageWrapper } from "@/components/PageWrapper";
import prisma from "@/utils/prisma";

export default async function MembersPage({
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
        <Members organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
