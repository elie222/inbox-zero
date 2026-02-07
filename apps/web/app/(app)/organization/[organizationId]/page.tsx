import { Members } from "@/app/(app)/organization/[organizationId]/Members";
import { OrgAnalyticsConsentBanner } from "@/app/(app)/organization/[organizationId]/OrgAnalyticsConsentBanner";
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
      <OrgAnalyticsConsentBanner />
      <div className="mt-6">
        <Members organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
