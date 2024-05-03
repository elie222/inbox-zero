import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { SparklesIcon } from "lucide-react";
import { PlanHistory } from "@/app/(app)/automation/PlanHistory";
import { Planned } from "@/app/(app)/automation/Planned";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { Button } from "@/components/ui/button";
import { Rules } from "@/app/(app)/automation/Rules";
import { TestRulesContent } from "@/app/(app)/automation/TestRules";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BulkRunRules } from "@/app/(app)/automation/BulkRunRules";

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
    <Suspense>
      <Tabs defaultValue="automations">
        <div className="content-container flex shrink-0 flex-col items-center justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0">
          <TabsList>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
          </TabsList>

          <div className="flex space-x-2">
            <BulkRunRules />

            <Button asChild>
              <Link href="/automation/create">
                <SparklesIcon className="mr-2 h-4 w-4" />
                Create Automation
              </Link>
            </Button>
          </div>
        </div>

        <TabsContent value="automations" className="content-container">
          <Rules />
        </TabsContent>
        <TabsContent value="pending">
          <Planned />
        </TabsContent>
        <TabsContent value="history" className="content-container">
          <Card>
            <PlanHistory />
          </Card>
        </TabsContent>
        <TabsContent value="test" className="content-container mb-2">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Test your rules</CardTitle>
              <CardDescription>
                Check how your rules perform against previous emails or custom
                content.
              </CardDescription>
            </CardHeader>
            <TestRulesContent />
          </Card>
        </TabsContent>
      </Tabs>
    </Suspense>
  );
}
