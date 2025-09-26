import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { AddIntegrationButton } from "@/app/(app)/[emailAccountId]/integrations/AddIntegrationButton";

export default function McpPage() {
  return (
    <PageWrapper>
      <div className="flex justify-between items-center">
        <PageHeader title="MCP" description="Manage your MCP connections." />
        <AddIntegrationButton />
      </div>

      <div className="mt-8">
        <Integrations />
      </div>
    </PageWrapper>
  );
}
