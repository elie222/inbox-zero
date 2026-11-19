"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { env } from "@/env";

export function WebhookSection() {
  if (env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED === false) return null;

  return <WebhookSectionContent />;
}

function WebhookSectionContent() {
  const { t } = useLingui();
  const { data, isLoading, error, mutate } = useUser();
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>
          <Trans>Webhook Secret</Trans>
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setGeneratedSecret(null);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {data?.hasWebhookSecret ? t`Manage Secret` : t`Generate Secret`}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Trans>Webhook Secret</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>
                  Include this in the X-Webhook-Secret header when setting up
                  webhook endpoints. Existing secrets are not shown again. When
                  you generate a new secret, copy it before closing this dialog.
                </Trans>
              </DialogDescription>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              {data && (
                <div className="space-y-4">
                  {generatedSecret ? (
                    <CopyInput value={generatedSecret} masked />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      <Trans>
                        Generate a new webhook secret to reveal it once for
                        copying.
                      </Trans>
                    </p>
                  )}
                  <RegenerateSecretButton
                    hasSecret={data.hasWebhookSecret}
                    mutate={mutate}
                    onGenerated={setGeneratedSecret}
                  />
                </div>
              )}
            </LoadingContent>
          </DialogContent>
        </Dialog>
      </ItemActions>
    </Item>
  );
}
