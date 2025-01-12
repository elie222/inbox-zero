import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { FormSection, FormSectionLeft } from "@/components/Form";
import prisma from "@/utils/prisma";
import { Card } from "@/components/ui/card";
import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/settings/WebhookGenerate";

export async function WebhookSection() {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { webhookSecret: true },
  });

  return (
    <FormSection>
      <FormSectionLeft
        title="Webhooks (Developers)"
        description="API webhook secret for request verification. Include this in the X-Webhook-Secret header when setting up webhook endpoints."
      />

      <div className="col-span-2">
        <Card className="p-6">
          <div className="space-y-4">
            {!!user?.webhookSecret && <CopyInput value={user?.webhookSecret} />}

            <RegenerateSecretButton hasSecret={!!user?.webhookSecret} />
          </div>
        </Card>
      </div>
    </FormSection>
  );
}
