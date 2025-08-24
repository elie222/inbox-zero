"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useLocalStorage } from "usehooks-ts";
import { ListIcon, PlusIcon, UserPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveRulesPromptAction } from "@/utils/actions/ai-rule";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import type { SaveRulesPromptBody } from "@/utils/actions/rule.validation";
import { LoadingContent } from "@/components/LoadingContent";
import { getPersonas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { useModal } from "@/hooks/useModal";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/assistant/ProcessingPromptFileDialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useRules } from "@/hooks/useRules";
import { Examples } from "@/app/(app)/[emailAccountId]/assistant/ExamplesList";

export function RulesPrompt() {
  const { emailAccountId, provider } = useAccount();
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(
    () => setIsModalOpen(true),
    [setIsModalOpen],
  );

  const [persona, setPersona] = useState<string | null>(null);
  const personas = getPersonas(provider);

  const personaPrompt = persona
    ? personas[persona as keyof typeof personas]?.prompt
    : undefined;

  // <AssistantOnboarding
  //   onComplete={() => {
  //     if (!data.rulesPrompt) onOpenPersonaDialog();
  //   }}
  // />

  return (
    <>
      <RulesPromptForm
        emailAccountId={emailAccountId}
        provider={provider}
        personaPrompt={personaPrompt}
        onOpenPersonaDialog={onOpenPersonaDialog}
      />
      <PersonaDialog
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        onSelect={setPersona}
        personas={personas}
      />
    </>
  );
}

function RulesPromptForm({
  emailAccountId,
  provider,
  personaPrompt,
  onOpenPersonaDialog,
}: {
  emailAccountId: string;
  provider: string;
  personaPrompt?: string;
  onOpenPersonaDialog: () => void;
}) {
  const { mutate } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [result, setResult] = useState<{
    createdRules: number;
    editedRules: number;
    removedRules: number;
  }>();
  const [
    viewedProcessingPromptFileDialog,
    setViewedProcessingPromptFileDialog,
  ] = useLocalStorage("viewedProcessingPromptFileDialog", false);

  const ruleDialog = useDialogState();

  const [isExamplesOpen, setIsExamplesOpen] = useState(false);

  const router = useRouter();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") return;

    const data = { rulesPrompt: markdown };

    setIsSubmitting(true);

    const saveRulesPromise = async (data: SaveRulesPromptBody) => {
      setIsSubmitting(true);
      const result = await saveRulesPromptAction(emailAccountId, data);

      if (result?.serverError) {
        setIsSubmitting(false);
        throw new Error(result.serverError);
      }

      if (viewedProcessingPromptFileDialog) {
        router.push(prefixPath(emailAccountId, "/automation?tab=test"));
      }

      mutate();
      setIsSubmitting(false);

      return result;
    };

    if (!viewedProcessingPromptFileDialog) {
      setIsDialogOpen(true);
    }
    setResult(undefined);

    toast.promise(() => saveRulesPromise(data), {
      loading: "Saving rules... This may take a while to process...",
      success: (result) => {
        const {
          createdRules = 0,
          editedRules = 0,
          removedRules = 0,
        } = result?.data || {};
        setResult({ createdRules, editedRules, removedRules });

        const message = [
          createdRules ? `${createdRules} rules created.` : "",
          editedRules ? `${editedRules} rules edited.` : "",
          removedRules ? `${removedRules} rules removed.` : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `Rules saved successfully! ${message}`;
      },
      error: (err) => {
        return `Error saving rules: ${err.message}`;
      },
    });
  }, [mutate, router, viewedProcessingPromptFileDialog, emailAccountId]);

  useEffect(() => {
    if (!personaPrompt) return;
    editorRef.current?.appendText(personaPrompt);
  }, [personaPrompt]);

  const addExamplePrompt = useCallback((example: string) => {
    editorRef.current?.appendText(`\n* ${example.trim()}`);
  }, []);

  return (
    <div>
      <ProcessingPromptFileDialog
        open={isDialogOpen}
        result={result}
        onOpenChange={setIsDialogOpen}
        setViewedProcessingPromptFileDialog={
          setViewedProcessingPromptFileDialog
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <form
          className="col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex items-center justify-between">
            <Label className="font-cal text-xl leading-7">Add new rules</Label>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => ruleDialog.open()}
              Icon={PlusIcon}
            >
              Add rule manually
            </Button>
          </div>

          <div className="mt-1.5 space-y-2">
            <LoadingContent
              loading={isLoadingLabels}
              loadingComponent={<Skeleton className="min-h-[70px] w-full" />}
            >
              <SimpleRichTextEditor
                ref={editorRef}
                defaultValue={undefined}
                minHeight={70}
                userLabels={userLabels}
                placeholder={"Write your rules here..."}
              />
            </LoadingContent>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={isSubmitting}>
                Create rules
              </Button>

              <Button variant="outline" size="sm" onClick={onOpenPersonaDialog}>
                <UserPenIcon className="mr-2 size-4" />
                Choose persona
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExamplesOpen((show) => !show)}
              >
                <ListIcon className="mr-2 size-4" />
                {isExamplesOpen ? "Hide examples" : "Show examples"}
              </Button>

              {/* <Tooltip content="Our AI will analyze your Gmail inbox and create a customized prompt for your assistant.">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || isGenerating}
                  onClick={async () => {
                    if (isSubmitting || isGenerating) return;
                    toast.promise(
                      async () => {
                        setIsGenerating(true);
                        const result = await generateRulesPromptAction(
                          emailAccountId,
                          {},
                        );

                        if (result?.serverError) {
                          setIsGenerating(false);
                          throw new Error(result.serverError);
                        }

                        if (result?.data?.rulesPrompt) {
                          editorRef.current?.appendText(
                            `\n${result?.data?.rulesPrompt || ""}`,
                          );
                        } else {
                          toast.error("Error generating prompt");
                        }

                        setIsGenerating(false);

                        return result;
                      },
                      {
                        loading: "Generating prompt...",
                        success: "Prompt generated successfully!",
                        error: (err) => {
                          return `Error generating prompt: ${err.message}`;
                        },
                      },
                    );
                  }}
                  loading={isGenerating}
                >
                  <SparklesIcon className="mr-2 size-4" />
                  Give me ideas
                </Button>
              </Tooltip> */}
            </div>
          </div>
        </form>

        <div>
          {isExamplesOpen && (
            <Examples
              onSelect={addExamplePrompt}
              provider={provider}
              className="mt-1.5 sm:h-[20vh] sm:max-h-[20vh]"
            />
          )}
        </div>
      </div>

      <RuleDialog
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.close}
        onSuccess={() => {
          mutate();
          ruleDialog.close();
        }}
        editMode={false}
      />
    </div>
  );
}
