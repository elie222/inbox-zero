"use client";

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

export function WebhookSection() {
  const { data, isLoading, error, mutate } = useUser();
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Webhook Secret</ItemTitle>
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
              {data?.hasWebhookSecret ? "Manage Secret" : "Generate Secret"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook Secret</DialogTitle>
              <DialogDescription>
                Include this in the X-Webhook-Secret header when setting up
                webhook endpoints. Existing secrets are not shown again. When
                you generate a new secret, copy it before closing this dialog.
              </DialogDescription>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              {data && (
                <div className="space-y-4">
                  {generatedSecret ? (
                    <CopyInput value={generatedSecret} masked />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a new webhook secret to reveal it once for
                      copying.
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
