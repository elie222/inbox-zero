"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
          <DialogTitle>Webhook Payload</DialogTitle>
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
      <div className="text-sm text-muted-foreground">
        When a rule with a webhook action is triggered, we'll send a POST request to your URL with the following payload:
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Webhook Payload Structure</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(payloadJson)}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        
        <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
          <code>{payloadJson}</code>
        </pre>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h5 className="font-medium mb-2">Email Fields</h5>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div><code>threadId</code> - Gmail/Outlook thread ID</div>
              <div><code>messageId</code> - Unique message ID</div>
              <div><code>subject</code> - Email subject line</div>
              <div><code>from</code> - Sender's email address</div>
              <div><code>cc/bcc</code> - Optional CC/BCC recipients</div>
              <div><code>headerMessageId</code> - Email Message-ID header</div>
            </div>
          </div>

          <div>
            <h5 className="font-medium mb-2">Rule Execution Fields</h5>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div><code>id</code> - Execution ID</div>
              <div><code>ruleId</code> - Rule that was triggered</div>
              <div><code>reason</code> - Why the rule was triggered</div>
              <div><code>automated</code> - Whether rule ran automatically</div>
              <div><code>createdAt</code> - When the rule was executed (ISO 8601)</div>
            </div>
          </div>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Authentication:</strong> Each request includes an <code>X-Webhook-Secret</code> header 
            with your webhook secret for verification.
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebhookDocumentationLink() {
  return (
    <WebhookDocumentationDialog>
      <Button variant="link" size="xs" className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800">
        <ExternalLink className="h-3 w-3 mr-1" />
        View payload structure
      </Button>
    </WebhookDocumentationDialog>
  );
}