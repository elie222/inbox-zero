import { FormWrapper } from "@/components/Form";
import { AboutSection } from "@/app/(app)/settings/AboutSection";
// import { SignatureSectionForm } from "@/app/(app)/settings/SignatureSectionForm";
// import { LabelsSection } from "@/app/(app)/settings/LabelsSection";
import { DeleteSection } from "@/app/(app)/settings/DeleteSection";
import { ModelSection } from "@/app/(app)/settings/ModelSection";
import { EmailUpdatesSection } from "@/app/(app)/settings/EmailUpdatesSection";
import { MultiAccountSection } from "@/app/(app)/settings/MultiAccountSection";
import { ApiKeysSection } from "@/app/(app)/settings/ApiKeysSection";
import { WebhookSection } from "@/app/(app)/settings/WebhookSection";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { NotLoggedIn } from "@/components/ErrorDisplay";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user.email) return <NotLoggedIn />;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      about: true,
      signature: true,
      statsEmailFrequency: true,
      webhookSecret: true,
    },
  });

  if (!user) return <NotLoggedIn />;

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
