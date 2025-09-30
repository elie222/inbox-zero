import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { Button } from "@/components/ui/button";
import { RequestAccessDialog } from "./RequestAccessDialog";

export default function IntegrationsPage() {
  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Integrations"
          description="Manage your integrations."
        />
        <RequestAccessDialog
          trigger={<Button variant="outline">Request an Integration</Button>}
        />
      </div>

      <div className="mt-8">
        <Integrations />
      </div>
    </PageWrapper>
  );
}
