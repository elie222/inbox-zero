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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsToolbar } from "@/components/TabsToolbar";

export default async function SettingsPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const params = await props.params;
  const emailAccountId = params.emailAccountId;

  const user = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      about: true,
      signature: true,
      statsEmailFrequency: true,
      webhookSecret: true,
    },
  });

  if (!user) return <p>Email account not found</p>;

  return (
    <Tabs defaultValue="email-account">
      <TabsToolbar>
        <div className="w-full overflow-x-auto">
          <TabsList>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="user">User</TabsTrigger>
          </TabsList>
        </div>
      </TabsToolbar>

      <TabsContent value="email" className="content-container mb-10">
        <FormWrapper>
          <AboutSection about={user.about} />
          {/* this is only used in Gmail when sending a new message. disabling for now. */}
          {/* <SignatureSectionForm signature={user.signature} /> */}
          {/* <LabelsSection /> */}
          <EmailUpdatesSection statsEmailFrequency={user.statsEmailFrequency} />
        </FormWrapper>
      </TabsContent>
      <TabsContent value="user">
        <FormWrapper>
          <ModelSection />
          <MultiAccountSection />
          <WebhookSection webhookSecret={user.webhookSecret} />
          <ApiKeysSection />
          <DeleteSection />
        </FormWrapper>
      </TabsContent>
    </Tabs>
  );
}
