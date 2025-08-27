import { WebhookDocumentation } from "@/components/WebhookDocumentation";
import { TypographyH1 } from "@/components/Typography";

export default function WebhookDocumentationPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <TypographyH1>Webhook Documentation</TypographyH1>
        <p className="text-muted-foreground mt-2">
          Learn how to integrate webhooks with your automation rules to extend functionality beyond email management.
        </p>
      </div>
      <WebhookDocumentation />
    </div>
  );
}