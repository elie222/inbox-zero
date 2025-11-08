"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useLocalStorage } from "usehooks-ts";
import { PlusIcon, UserPenIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createRulesAction } from "@/utils/actions/ai-rule";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { getPersonas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { useModal } from "@/hooks/useModal";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/assistant/ProcessingPromptFileDialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useRules } from "@/hooks/useRules";
import { ExamplesGrid } from "@/app/(app)/[emailAccountId]/assistant/ExamplesList";
import { AssistantOnboarding } from "@/app/(app)/[emailAccountId]/assistant/AssistantOnboarding";
import { CreatedRulesModal } from "@/app/(app)/[emailAccountId]/assistant/CreatedRulesModal";
import type { CreateRuleResult } from "@/utils/rule/types";
import { toastError } from "@/components/Toast";
import { AvailableActionsPanel } from "@/app/(app)/[emailAccountId]/assistant/AvailableActionsPanel";

export function RulesPrompt() {
  const { emailAccountId, provider } = useAccount();
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(
    () => setIsModalOpen(true),
    [setIsModalOpen],
  );

  const [persona, setPersona] = useState<string | null>(null);
  const personas = getPersonas(provider);

  const examples = persona
    ? personas[persona as keyof typeof personas]?.promptArray
    : undefined;

  return (
    <>
      <RulesPromptForm
        emailAccountId={emailAccountId}
        provider={provider}
        examples={examples}
        onOpenPersonaDialog={onOpenPersonaDialog}
        onHideExamples={() => setPersona(null)}
      />
      <PersonaDialog
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        onSelect={setPersona}
        personas={personas}
      />
      <AssistantOnboarding />
    </>
  );
}

function RulesPromptForm({
  emailAccountId,
  provider,
  examples,
  onOpenPersonaDialog,
  onHideExamples,
}: {
  emailAccountId: string;
  provider: string;
  examples?: string[];
  onOpenPersonaDialog: () => void;
  onHideExamples: () => void;
}) {
  const { mutate } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingDialogOpen, setIsProcessingDialogOpen] = useState(false);
  const [createdRules, setCreatedRules] = useState<CreateRuleResult[] | null>(
    null,
  );
  const [showCreatedRulesModal, setShowCreatedRulesModal] = useState(false);
  const [
    viewedProcessingPromptFileDialog,
    setViewedProcessingPromptFileDialog,
  ] = useLocalStorage("viewedProcessingPromptFileDialog", false);

  const ruleDialog = useDialogState();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") return;
    if (markdown.trim() === "") {
      toastError({
        description: "Please enter a prompt to create rules",
      });
      return;
    }

    setIsSubmitting(true);
    if (!viewedProcessingPromptFileDialog) setIsProcessingDialogOpen(true);
    setCreatedRules(null);

    toast.promise(
      async () => {
        const result = await createRulesAction(emailAccountId, {
          prompt: markdown,
        }).finally(() => {
          setIsSubmitting(false);
        });

        if (result?.serverError) throw new Error(result.serverError);

        mutate();

        return result;
      },
      {
        loading: "Creating rules...",
        success: (result) => {
          const { rules = [] } = result?.data || {};
          setCreatedRules(rules);

          return `${rules.length} rules created!`;
        },
        error: (err) => {
          return `Error creating rules: ${err.message}`;
        },
      },
    );
  }, [mutate, viewedProcessingPromptFileDialog, emailAccountId]);

  useEffect(() => {
    if (createdRules && createdRules.length > 0 && !isProcessingDialogOpen) {
      setShowCreatedRulesModal(true);
    }
  }, [createdRules, isProcessingDialogOpen]);

  const addExamplePrompt = useCallback((example: string) => {
    editorRef.current?.appendText(`\n* ${example.trim()}`);
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,250px] gap-6">
        <div className="grid gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <Label className="font-cal text-xl leading-7">Add new rules</Label>

            <div className="mt-1.5 space-y-2">
              <LoadingContent
                loading={isLoadingLabels}
                loadingComponent={<Skeleton className="min-h-[180px] w-full" />}
              >
                <SimpleRichTextEditor
                  ref={editorRef}
                  defaultValue={undefined}
                  minHeight={180}
                  userLabels={userLabels}
                  placeholder={`* Label urgent emails as "Urgent"
* Forward receipts to jane@accounting.com`}
                />
              </LoadingContent>

              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <Button type="submit" size="sm" loading={isSubmitting}>
                  Create rules
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={examples ? onHideExamples : onOpenPersonaDialog}
                >
                  <UserPenIcon className="mr-2 size-4" />
                  {examples ? "Hide examples" : "Choose from examples"}
                </Button>

                <Button
                  className="ml-auto w-full sm:w-auto"
                  variant="outline"
                  size="sm"
                  onClick={() => ruleDialog.onOpen()}
                  Icon={PlusIcon}
                >
                  Add rule manually
                </Button>
              </div>
            </div>
          </form>
        </div>

        <AvailableActionsPanel />
      </div>

      {examples && (
        <div className="mt-2">
          <Label className="font-cal text-xl leading-7">Examples</Label>
          <div className="mt-1.5">
            <ExamplesGrid
              examples={examples}
              onSelect={addExamplePrompt}
              provider={provider}
            />
          </div>
        </div>
      )}

      <RuleDialog
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
        editMode={false}
      />

      <ProcessingPromptFileDialog
        open={isProcessingDialogOpen}
        result={createdRules}
        onOpenChange={setIsProcessingDialogOpen}
        setViewedProcessingPromptFileDialog={
          setViewedProcessingPromptFileDialog
        }
      />

      <CreatedRulesModal
        open={showCreatedRulesModal}
        onOpenChange={(open) => {
          setShowCreatedRulesModal(open);

          // Clear results when modal closes to prevent re-showing
          if (!open) {
            setCreatedRules(null);
          }
        }}
        rules={createdRules}
      />
    </div>
  );
}
