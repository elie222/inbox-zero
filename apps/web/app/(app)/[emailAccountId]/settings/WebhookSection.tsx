"use client";

import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";

export function WebhookSection() {
  const { data, isLoading, error, mutate } = useUser();

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">Webhooks (Developers)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          API webhook secret for request verification. Include this in the
          X-Webhook-Secret header when setting up webhook endpoints. Set webhook
          URLs for individual rules in the Assistant=&gt;Rules tab.
        </p>
      </div>

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div className="space-y-4">
            {!!data.webhookSecret && <CopyInput value={data.webhookSecret} />}

            <RegenerateSecretButton
              hasSecret={!!data.webhookSecret}
              mutate={mutate}
            />
          </div>
        )}
      </LoadingContent>
    </section>
  );
}
