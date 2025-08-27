"use client";

import { FormSection, FormSectionLeft } from "@/components/Form";
import { Card } from "@/components/ui/card";
import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { WebhookDocumentationLink } from "@/components/WebhookDocumentation";

export function WebhookSection() {
  const { data, isLoading, error, mutate } = useUser();

  return (
    <FormSection>
      <FormSectionLeft
        title="Webhooks (Developers)"
        description="API webhook secret for request verification. Include this in the X-Webhook-Secret header when setting up webhook endpoints. View payload structure to see what data is sent."
      />

      <div className="col-span-2">
        <Card className="p-6">
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <div className="space-y-4">
                {!!data.webhookSecret && (
                  <CopyInput value={data.webhookSecret} />
                )}

                <div className="flex items-center gap-3">
                  <RegenerateSecretButton
                    hasSecret={!!data.webhookSecret}
                    mutate={mutate}
                  />
                  <WebhookDocumentationLink />
                </div>
              </div>
            )}
          </LoadingContent>
        </Card>
      </div>
    </FormSection>
  );
}
