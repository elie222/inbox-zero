"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/Badge";

export function WebhookDocumentationDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Documentation</DialogTitle>
        </DialogHeader>
        <WebhookDocumentation />
      </DialogContent>
    </Dialog>
  );
}

export function WebhookDocumentation() {
  const [copiedSection, setCopiedSection] = useState<string>("");

  const copyToClipboard = async (text: string, sectionId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(""), 2000);
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

  const typescriptTypes = `// Webhook payload TypeScript types
type WebhookPayload = {
  email: {
    threadId: string;
    messageId: string;
    subject: string;
    from: string;
    cc?: string;
    bcc?: string;
    headerMessageId: string;
  };
  executedRule: {
    id: string;
    ruleId: string;
    reason: string;
    automated: boolean;
    createdAt: string; // ISO 8601 timestamp
  };
};`;

  const exampleHandlers = {
    node: `// Node.js/Express webhook handler
app.post('/webhook', express.json(), (req, res) => {
  const webhookSecret = req.headers['x-webhook-secret'];
  
  // Verify webhook secret
  if (webhookSecret !== process.env.EXPECTED_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { email, executedRule } = req.body;
  
  console.log('Email processed:', {
    subject: email.subject,
    from: email.from,
    ruleReason: executedRule.reason
  });
  
  // Your custom logic here
  // e.g., update CRM, send to Slack, log to database
  
  res.status(200).json({ success: true });
});`,
    python: `# Python/Flask webhook handler
from flask import Flask, request, jsonify
import os

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    webhook_secret = request.headers.get('X-Webhook-Secret')
    
    # Verify webhook secret
    if webhook_secret != os.getenv('EXPECTED_WEBHOOK_SECRET'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    email = data['email']
    executed_rule = data['executedRule']
    
    print(f"Email processed: {email['subject']} from {email['from']}")
    print(f"Rule: {executed_rule['reason']}")
    
    # Your custom logic here
    # e.g., update database, send notification
    
    return jsonify({'success': True})`,
    curl: `# Test your webhook with curl
curl -X POST "https://your-domain.com/webhook" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: your-secret-key" \\
  -d '${JSON.stringify(payloadExample, null, 2)}'`,
  };

  return (
    <div className="space-y-6">
                <div className="text-sm text-muted-foreground">
        When a rule with a webhook action is triggered, we'll send a POST request to your specified URL with details about the email and executed rule.
        You can use variables like <code className="bg-muted px-1 py-0.5 rounded text-xs">{"{{subject}}"}</code> in your webhook URL for dynamic endpoints.
      </div>

      <Tabs defaultValue="payload" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="payload">Payload</TabsTrigger>
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="payload" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg">Webhook Payload</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(payloadExample, null, 2),
                    "payload"
                  )
                }
              >
                {copiedSection === "payload" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>{JSON.stringify(payloadExample, null, 2)}</code>
              </pre>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email Fields</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">threadId</code> - Gmail/Outlook thread ID
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">messageId</code> - Unique message ID
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">subject</code> - Email subject line
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">from</code> - Sender's email address
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">cc/bcc</code> - Optional CC/BCC recipients
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">headerMessageId</code> - Email Message-ID header
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rule Execution Fields</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">id</code> - Execution ID
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">ruleId</code> - Rule that was triggered
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">reason</code> - Why the rule was triggered
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">automated</code> - Whether rule ran automatically
                </div>
                <div className="text-sm">
                  <code className="bg-muted px-1 py-0.5 rounded">createdAt</code> - When the rule was executed
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg">TypeScript Types</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(typescriptTypes, "types")}
              >
                {copiedSection === "types" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>{typescriptTypes}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples" className="space-y-4">
          <Tabs defaultValue="node" className="w-full">
            <TabsList>
              <TabsTrigger value="node">Node.js</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>

            {Object.entries(exampleHandlers).map(([key, code]) => (
              <TabsContent key={key} value={key}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-lg capitalize">
                      {key === "curl" ? "Test with cURL" : `${key} Handler`}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(code, key)}
                    >
                      {copiedSection === key ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                      <code>{code}</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">URL Variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  You can use dynamic variables in your webhook URLs to create different endpoints based on email content.
                  Variables are processed before the webhook is called.
                </p>
                
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium mb-2">Example URLs with Variables</h4>
                    <div className="space-y-2">
                      <div className="bg-muted p-3 rounded-md">
                        <code className="text-sm">https://api.example.com/webhook/{"{{from}}"}</code>
                        <p className="text-xs text-muted-foreground mt-1">Creates different endpoints per sender</p>
                      </div>
                      <div className="bg-muted p-3 rounded-md">
                        <code className="text-sm">https://api.example.com/{"{{label}}"}/webhook</code>
                        <p className="text-xs text-muted-foreground mt-1">Routes to different services based on label</p>
                      </div>
                      <div className="bg-muted p-3 rounded-md">
                        <code className="text-sm">https://hooks.zapier.com/webhook/{"{{threadId}}"}</code>
                        <p className="text-xs text-muted-foreground mt-1">Include thread ID in the URL path</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Available Variables</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="text-sm">
                        <code className="bg-muted px-1 py-0.5 rounded">{"{{from}}"}</code> - Sender email
                      </div>
                      <div className="text-sm">
                        <code className="bg-muted px-1 py-0.5 rounded">{"{{subject}}"}</code> - Email subject
                      </div>
                      <div className="text-sm">
                        <code className="bg-muted px-1 py-0.5 rounded">{"{{threadId}}"}</code> - Thread ID
                      </div>
                      <div className="text-sm">
                        <code className="bg-muted px-1 py-0.5 rounded">{"{{messageId}}"}</code> - Message ID
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      <strong>Note:</strong> Variables in URLs are URL-encoded automatically. 
                      Special characters in email addresses and subjects will be properly escaped.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Webhook Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Authentication</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Every webhook request includes an <code className="bg-muted px-1 py-0.5 rounded">X-Webhook-Secret</code> header with your unique webhook secret.
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Header</Badge>
                  <code className="bg-muted px-2 py-1 rounded text-sm">X-Webhook-Secret: your-webhook-secret</code>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Best Practices</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Always verify the webhook secret before processing</li>
                  <li>Use HTTPS endpoints to ensure encrypted communication</li>
                  <li>Implement idempotency to handle duplicate webhooks</li>
                  <li>Return 2xx status codes for successful processing</li>
                  <li>Respond quickly (within 10 seconds) to avoid timeouts</li>
                  <li>Log webhook events for debugging and monitoring</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">Timeout Handling</h4>
                <p className="text-sm text-muted-foreground">
                  Webhook requests timeout after 10 seconds. If your endpoint doesn't respond in time, 
                  the request will be cancelled, but rule execution will continue normally.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function WebhookDocumentationLink() {
  return (
    <WebhookDocumentationDialog>
      <Button variant="link" size="xs" className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800">
        <ExternalLink className="h-3 w-3 mr-1" />
        View payload schema
      </Button>
    </WebhookDocumentationDialog>
  );
}