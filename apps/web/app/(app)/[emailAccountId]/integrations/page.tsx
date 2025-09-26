import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";

export default function IntegrationsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Integrations"
        description="Manage your integrations."
      />

      <div className="mt-8">
        <Integrations />
      </div>
    </PageWrapper>
  );
}
