import Link from "next/link";
import { Suspense } from "react";
import { SparklesIcon } from "lucide-react";
import { History } from "@/app/(app)/automation/History";
import { Pending } from "@/app/(app)/automation/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Button } from "@/components/ui/button";
import { Rules } from "@/app/(app)/automation/Rules";
import { TestRulesContent } from "@/app/(app)/automation/TestRules";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BulkRunRules } from "@/app/(app)/automation/BulkRunRules";
import { Groups } from "@/app/(app)/automation/groups/Groups";

export default async function AutomationPage() {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in");

  return (
    <Suspense>
      <Tabs defaultValue="automations">
        <div className="content-container flex shrink-0 flex-col items-center justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0">
          <TabsList>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
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

        <TabsContent value="automations" className="content-container mb-10">
          <Rules />
        </TabsContent>
        <TabsContent value="pending" className="content-container mb-10">
          <Pending />
        </TabsContent>
        <TabsContent value="history" className="content-container mb-10">
          <History />
        </TabsContent>
        <TabsContent value="test" className="content-container mb-10">
          <Card>
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
        <TabsContent value="groups" className="content-container mb-10">
          <Groups />
        </TabsContent>
      </Tabs>
    </Suspense>
  );
}
