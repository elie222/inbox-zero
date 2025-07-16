"use client";

import { XIcon } from "lucide-react";
import { useCallback } from "react";
import { useQueryState } from "nuqs";
import useSWR from "swr";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Pending } from "@/app/(app)/[emailAccountId]/assistant/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPrompt";
import { TabsToolbar } from "@/components/TabsToolbar";
import { TypographyP } from "@/components/Typography";
import { RuleTab } from "@/app/(app)/[emailAccountId]/assistant/RuleTab";
import type { GetPendingRulesResponse } from "@/app/api/rules/pending/route";
import { Button } from "@/components/ui/button";

export function AssistantTabs() {
  const { data: pendingData } =
    useSWR<GetPendingRulesResponse>("/api/rules/pending");

  const hasPendingRule = pendingData?.hasPending ?? false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="empty" className="flex h-full flex-col">
        <TabsToolbar className="shrink-0 border-none pb-0 shadow-none">
          <div className="w-full overflow-x-auto">
            <TabsList>
              {/* <TabsTrigger value="prompt">Prompt</TabsTrigger> */}
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              {hasPendingRule && (
                <TabsTrigger value="pending">Pending</TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link
                    href={prefixPath(
                      emailAccountId,
                      "/assistant/onboarding",
                    )}
                  >
                    Set Up
                  </Link>
                </Button>

                <OnboardingModal
                  title="Getting started with AI Personal Assistant"
                  description={
                    <>
                      Learn how to use the AI Personal Assistant to
                      automatically label, archive, and more.
                    </>
                  }
                  videoId="SoeNDVr7ve4"
                />
              </div> */}

          <CloseArtifactButton />
        </TabsToolbar>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="empty" className="mt-0 h-full">
            <div className="flex h-full items-center justify-center">
              <TypographyP className="max-w-sm px-4 text-center">
                Select a tab or add rules via the assistant
              </TypographyP>
            </div>
          </TabsContent>

          <TabsContent value="prompt" className="mt-0 h-full">
            <RulesPrompt />
          </TabsContent>
          <TabsContent value="rules" className="content-container pb-4">
            <Rules />
          </TabsContent>
          <TabsContent value="test" className="content-container pb-4">
            <Process />
          </TabsContent>
          <TabsContent value="history" className="content-container pb-4">
            <History />
          </TabsContent>
          {hasPendingRule && (
            <TabsContent value="pending" className="content-container pb-4">
              <Pending />
            </TabsContent>
          )}
          {/* Set via search params. Not a visible tab. */}
          <TabsContent value="rule" className="content-container pb-4">
            <RuleTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function CloseArtifactButton() {
  const [_tab, setTab] = useQueryState("tab");

  const onClose = useCallback(() => setTab(null), [setTab]);

  return (
    <Button size="icon" variant="ghost" onClick={onClose}>
      <XIcon className="size-4" />
    </Button>
  );
}
