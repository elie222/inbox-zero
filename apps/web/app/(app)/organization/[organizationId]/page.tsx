import { Members } from "@/app/(app)/organization/[organizationId]/Members";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <PageHeader title="Organization Members" />

      <div className="mt-4">
        <Members organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
