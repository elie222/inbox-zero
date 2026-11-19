"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MutedText } from "@/components/Typography";

export function WebhookDocumentationDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans>Webhook Payload</Trans>
          </DialogTitle>
        </DialogHeader>
        <WebhookPayloadDocumentation />
      </DialogContent>
    </Dialog>
  );
}

export function WebhookPayloadDocumentation() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const payloadExample = {
    email: {
      threadId: "thread_abc123",
      messageId: "message_xyz789",
      subject: "Important Contract Document",
      from: "client@company.com",
      cc: "team@company.com",
      bcc: "archive@company.com",
      headerMessageId: "<CAF=4sK9...@mail.gmail.com>",
    },
    executedRule: {
      id: "exec_rule_123",
      ruleId: "rule_456",
      reason: "Email matched rule: Archive contracts",
      automated: true,
      createdAt: "2024-01-15T10:30:00.000Z",
    },
  };

  const payloadJson = JSON.stringify(payloadExample, null, 2);

  return (
    <div className="space-y-4">
      <MutedText>
        <Trans>
          When a rule with a webhook action is triggered, we'll send a POST
          request to your URL with the following payload:
        </Trans>
      </MutedText>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">
            <Trans>Webhook Payload Structure</Trans>
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(payloadJson)}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
          <code>{payloadJson}</code>
        </pre>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h5 className="font-medium mb-2">
              <Trans>Email Fields</Trans>
            </h5>
            <div className="space-y-1">
              <MutedText>
                <Trans>
                  <code>threadId</code> - Gmail/Outlook thread ID
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>messageId</code> - Unique message ID
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>subject</code> - Email subject line
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>from</code> - Sender's email address
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>cc/bcc</code> - Optional CC/BCC recipients
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>headerMessageId</code> - Email Message-ID header
                </Trans>
              </MutedText>
            </div>
          </div>

          <div>
            <h5 className="font-medium mb-2">
              <Trans>Rule Execution Fields</Trans>
            </h5>
            <div className="space-y-1">
              <MutedText>
                <Trans>
                  <code>id</code> - Execution ID
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>ruleId</code> - Rule that was triggered
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>reason</code> - Why the rule was triggered
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>automated</code> - Whether rule ran automatically
                </Trans>
              </MutedText>
              <MutedText>
                <Trans>
                  <code>createdAt</code> - When the rule was executed (ISO 8601)
                </Trans>
              </MutedText>
            </div>
          </div>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <Trans>
              <strong>Authentication:</strong> Each request includes an{" "}
              <code>X-Webhook-Secret</code> header with your webhook secret for
              verification.
            </Trans>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebhookDocumentationLink() {
  return (
    <WebhookDocumentationDialog>
      <Button
        variant="link"
        size="xs"
        className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
      >
        <Trans>View payload structure</Trans>
      </Button>
    </WebhookDocumentationDialog>
  );
}
