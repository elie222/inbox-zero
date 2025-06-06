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
import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPrompt";
import { TabsToolbar } from "@/components/TabsToolbar";
import { TypographyP } from "@/components/Typography";
import { RuleTab } from "@/app/(app)/[emailAccountId]/assistant/RuleTab";
import type { GetPendingRulesResponse } from "@/app/api/rules/pending/route";
import { Button } from "@/components/ui/button";
import {
  SparklesIcon,
  LibraryIcon,
  RocketIcon,
  ClockIcon,
  HistoryIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import { TestCustomEmailForm } from "@/app/(app)/[emailAccountId]/assistant/TestCustomEmailForm";

export function AssistantTabs() {
  const { emailAccountId } = useAccount();
  const { data: pendingData } =
    useSWR<GetPendingRulesResponse>("/api/rules/pending");

  const hasPendingRule = pendingData?.hasPending ?? false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="empty" className="flex h-full flex-col">
        <TabsToolbar className="shrink-0 border-none pb-0 shadow-none">
          <div className="w-full overflow-x-auto">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="rules">
                <SparklesIcon className="mr-2 size-4" />
                Rules
              </TabsTrigger>
              <TabsTrigger value="knowledge">
                <LibraryIcon className="mr-2 size-4" />
                Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="onboarding">
                <RocketIcon className="mr-2 size-4" />
                Onboarding
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative">
                <ClockIcon className="mr-2 size-4" />
                Pending
              </TabsTrigger>
              <TabsTrigger value="history">
                <HistoryIcon className="mr-2 size-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="rules-editor-demo">
                Rules Editor (Demo)
              </TabsTrigger>
            </TabsList>
          </div>

          <Button size="sm" variant="outline" asChild>
            <a
              href="https://docs.getinboxzero.com/product-manual/assistants"
              target="_blank"
              rel="noreferrer"
            >
              How it works
            </a>
          </Button>

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
            <TestCustomEmailForm />
          </TabsContent>
          <TabsContent value="history" className="content-container pb-4">
            <History />
          </TabsContent>
          {hasPendingRule && (
            <TabsContent value="pending" className="content-container pb-4">
              <Pending />
            </TabsContent>
          )}
          <TabsContent value="knowledge" className="content-container pb-4">
            <KnowledgeBase />
          </TabsContent>
          <TabsContent
            value="rules-editor-demo"
            className="content-container pb-4"
          >
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="mb-4 text-2xl font-bold">Rules Editor Demo</h2>
              <p className="mb-6 text-gray-600">
                Try our new document-style rules editor with custom TipTap nodes
              </p>
              <Button asChild>
                <Link
                  href={prefixPath(emailAccountId, "/assistant/rules-editor")}
                >
                  Open Rules Editor
                </Link>
              </Button>
            </div>
          </TabsContent>
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
