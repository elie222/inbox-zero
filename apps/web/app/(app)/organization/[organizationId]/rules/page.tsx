import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { OrganizationRules } from "@/app/(app)/organization/[organizationId]/rules/OrganizationRules";
import { PageWrapper } from "@/components/PageWrapper";

export default async function OrganizationRulesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />
      <div className="mt-6">
        <OrganizationRules organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
