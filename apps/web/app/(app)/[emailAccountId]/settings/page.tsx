import { FormWrapper } from "@/components/Form";
import { AboutSection } from "@/app/(app)/[emailAccountId]/settings/AboutSection";
// import { SignatureSectionForm } from "@/app/(app)/settings/SignatureSectionForm";
// import { LabelsSection } from "@/app/(app)/settings/LabelsSection";
import { DeleteSection } from "@/app/(app)/[emailAccountId]/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/[emailAccountId]/settings/ModelSection";
import { EmailUpdatesSection } from "@/app/(app)/[emailAccountId]/settings/EmailUpdatesSection";
import { MultiAccountSection } from "@/app/(app)/[emailAccountId]/settings/MultiAccountSection";
import { ApiKeysSection } from "@/app/(app)/[emailAccountId]/settings/ApiKeysSection";
import { WebhookSection } from "@/app/(app)/[emailAccountId]/settings/WebhookSection";
import prisma from "@/utils/prisma";

export default async function SettingsPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const params = await props.params;
  const emailAccountId = params.emailAccountId;

  const user = await prisma.emailAccount.findUnique({
    where: { accountId },
    select: {
      about: true,
      signature: true,
      statsEmailFrequency: true,
      webhookSecret: true,
    },
  });

  if (!user) return <p>Email account not found</p>;

  return (
    <FormWrapper>
      <AboutSection about={user.about} />
      {/* this is only used in Gmail when sending a new message. disabling for now. */}
      {/* <SignatureSectionForm signature={user.signature} /> */}
      {/* <LabelsSection /> */}
      <ModelSection />
      <EmailUpdatesSection statsEmailFrequency={user.statsEmailFrequency} />
      <MultiAccountSection />
      <WebhookSection webhookSecret={user.webhookSecret} />
      <ApiKeysSection />
      <DeleteSection />
    </FormWrapper>
  );
}
