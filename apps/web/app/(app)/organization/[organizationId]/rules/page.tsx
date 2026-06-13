import { PageWrapper } from "@/components/PageWrapper";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { OrgRules } from "@/app/(app)/organization/[organizationId]/rules/OrgRules";

export default async function OrgRulesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />
      <div className="mt-6">
        <OrgRules organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
