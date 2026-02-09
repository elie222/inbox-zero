"use client";

import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingsSection } from "@/components/SettingsSection";

export function WebhookSection() {
  const { data, isLoading, error, mutate } = useUser();

  return (
    <SettingsSection
      title="Webhooks (Developers)"
      description="API webhook secret for request verification. Include this in the X-Webhook-Secret header when setting up webhook endpoints. Set webhook URLs for individual rules in the Assistant=>Rules tab."
    >
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
    </SettingsSection>
  );
}
