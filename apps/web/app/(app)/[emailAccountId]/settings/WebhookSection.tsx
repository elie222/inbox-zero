"use client";

import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { Item, ItemContent, ItemTitle, ItemActions } from "@/components/ui/item";
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

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Webhook Secret</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View Secret
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook Secret</DialogTitle>
              <DialogDescription>
                Include this in the X-Webhook-Secret header when setting up
                webhook endpoints. Set webhook URLs for individual rules in
                Assistant &gt; Rules.
              </DialogDescription>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              {data && (
                <div className="space-y-4">
                  {!!data.webhookSecret && (
                    <CopyInput value={data.webhookSecret} masked />
                  )}
                  <RegenerateSecretButton
                    hasSecret={!!data.webhookSecret}
                    mutate={mutate}
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
