import { redirect } from "next/navigation";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { PlanHistory } from "@/app/(app)/automation/PlanHistory";
import { Planned } from "@/app/(app)/automation/Planned";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { Button } from "@/components/ui/button";
import { Rules } from "@/app/(app)/automation/Rules";

export default async function NewAutomationPage() {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in");
  const [rule, executedRule] = await Promise.all([
    prisma.rule.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    prisma.executedRule.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ]);
  if (!rule && !executedRule) redirect("/automation/create");

  return (
    <Tabs defaultValue="pending">
      <div className="flex shrink-0 flex-col items-center justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white px-4 py-2 shadow-sm sm:flex-row sm:gap-x-6 sm:space-y-0 sm:px-6">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
        </TabsList>

        <Button asChild>
          <Link href="/automation/create">
            <SparklesIcon className="mr-2 h-4 w-4" />
            Create Automation
          </Link>
        </Button>
      </div>

      <TabsContent value="pending">
        <Planned />
      </TabsContent>
      <TabsContent value="history">
        <PlanHistory />
      </TabsContent>
      <TabsContent value="automations">
        <Rules />
      </TabsContent>
    </Tabs>
  );
}
