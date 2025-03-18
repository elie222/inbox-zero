import { redirect } from "next/navigation";
import { getLastJob } from "@/app/(app)/clean/helpers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ConfirmationStep } from "@/app/(app)/clean/ConfirmationStep";
import { Card } from "@/components/ui/card";

export default async function CleanPage() {
  const session = await auth();
  if (!session?.user.id) return <div>Not authenticated</div>;

  const lastJob = await getLastJob(session.user.id);
  if (!lastJob) redirect("/clean/onboarding");

  return (
    <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <ConfirmationStep showFooter />
    </Card>
  );
}
