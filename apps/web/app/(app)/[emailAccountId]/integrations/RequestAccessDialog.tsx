"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { toastSuccess } from "@/components/Toast";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";

interface RequestAccessDialogProps {
  integrationName?: string;
  trigger?: React.ReactNode;
}

export function RequestAccessDialog({
  integrationName,
  trigger,
}: RequestAccessDialogProps) {
  const { t } = useLingui();
  const isGenericRequest = !integrationName;
  const title = isGenericRequest
    ? t`Request an Integration`
    : t`Request ${integrationName} Access`;
  const subject = isGenericRequest
    ? "Integration Request"
    : `Request Access: ${integrationName} Integration`;

  const messageBody = isGenericRequest
    ? `Hi,\n\nI would like to request a new integration for ${BRAND_NAME}.\n\nIntegration name:\n\nUse case:\n\nThank you!`
    : `Hi,\n\nI'm interested in using the ${integrationName} integration with ${BRAND_NAME}.\n\nCould you please let me know when this integration will be available?\n\nThank you!`;

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    toastSuccess({ description: t`Email copied to clipboard` });
  };

  const handleCopyMessage = async () => {
    const message = `Subject: ${subject}\n\n${messageBody}`;
    await navigator.clipboard.writeText(message);
    toastSuccess({ description: t`Message copied to clipboard` });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <Trans>Request Access</Trans>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isGenericRequest
              ? t`Send us an email to request a new integration.`
              : t`Send us an email to request access to this integration.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">
              <Trans>Email</Trans>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
                {SUPPORT_EMAIL}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopyEmail}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">
              <Trans>Message</Trans>
            </div>
            <div className="flex flex-col gap-2 mt-1">
              <div className="rounded bg-muted px-3 py-2 text-sm">
                <div className="font-medium mb-2">Subject: {subject}</div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {messageBody}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyMessage}
                className="self-end"
              >
                <Copy className="h-4 w-4 mr-2" />
                <Trans>Copy Message</Trans>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
