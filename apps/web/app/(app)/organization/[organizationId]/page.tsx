import { Members } from "@/app/(app)/organization/[organizationId]/Members";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { PageWrapper } from "@/components/PageWrapper";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />

      <div className="mt-6">
        <Members organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
