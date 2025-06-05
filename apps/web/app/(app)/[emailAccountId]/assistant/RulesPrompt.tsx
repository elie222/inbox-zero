"use client";

import { useCallback, useEffect, useState, memo, useRef } from "react";
import { useLocalStorage } from "usehooks-ts";
import { SparklesIcon, UserPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  saveRulesPromptAction,
  generateRulesPromptAction,
} from "@/utils/actions/ai-rule";
import { Input } from "@/components/Input";
import {
  saveRulesPromptBody,
  type SaveRulesPromptBody,
} from "@/utils/actions/rule.validation";
import type { RulesPromptResponse } from "@/app/api/user/rules/prompt/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { AssistantOnboarding } from "@/app/(app)/[emailAccountId]/assistant/AssistantOnboarding";
import {
  examplePrompts,
  personas,
} from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { useModal } from "@/hooks/useModal";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/assistant/ProcessingPromptFileDialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/Typography";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils";
import { Notice } from "@/components/Notice";
import { getActionTypeColor } from "@/app/(app)/[emailAccountId]/assistant/constants";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";

export function RulesPrompt() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<
    RulesPromptResponse,
    { error: string }
  >("/api/user/rules/prompt");
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(
    () => setIsModalOpen(true),
    [setIsModalOpen],
  );

  const [persona, setPersona] = useState<string | null>(null);

  const personaPrompt = persona
    ? personas[persona as keyof typeof personas]?.prompt
    : undefined;

  return (
    <>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div className="mt-4">
            <RulesPromptForm
              emailAccountId={emailAccountId}
              rulesPrompt={data.rulesPrompt}
              personaPrompt={personaPrompt}
              mutate={mutate}
              onOpenPersonaDialog={onOpenPersonaDialog}
              showExamples
            />
            <AssistantOnboarding
              onComplete={() => {
                if (!data.rulesPrompt) onOpenPersonaDialog();
              }}
            />
          </div>
        )}
      </LoadingContent>
      <PersonaDialog
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        onSelect={setPersona}
      />
    </>
  );
}

function RulesPromptForm({
  emailAccountId,
  rulesPrompt,
  personaPrompt,
  mutate,
  onOpenPersonaDialog,
  showExamples,
}: {
  emailAccountId: string;
  rulesPrompt: string | null;
  personaPrompt?: string;
  mutate: () => void;
  onOpenPersonaDialog: () => void;
  showExamples?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [result, setResult] = useState<{
    createdRules: number;
    editedRules: number;
    removedRules: number;
  }>();
  const [showClearWarning, setShowClearWarning] = useState(false);

  const [
    viewedProcessingPromptFileDialog,
    setViewedProcessingPromptFileDialog,
  ] = useLocalStorage("viewedProcessingPromptFileDialog", false);

  const editorRef = useRef<TiptapHandle>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
    control,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt: rulesPrompt || undefined },
  });

  useEffect(() => {
    if (!personaPrompt) return;

    const currentPrompt = editorRef.current?.getMarkdown() || "";
    const updatedPrompt = `${currentPrompt}\n\n${personaPrompt}`.trim();
    
    // Append the persona prompt to the editor
    if (editorRef.current && personaPrompt) {
      editorRef.current.appendContent(`\n\n${personaPrompt}`);
    }
  }, [personaPrompt]);

  const router = useRouter();

  const onSubmit = useCallback(
    async (data: SaveRulesPromptBody) => {
      setIsSubmitting(true);

      // Get markdown content from editor
      const markdownContent = editorRef.current?.getMarkdown();
      const submitData = {
        ...data,
        rulesPrompt: markdownContent ?? "",
      };

      const saveRulesPromise = async (submitData: SaveRulesPromptBody) => {
        setIsSubmitting(true);
        const result = await saveRulesPromptAction(emailAccountId, submitData);

        if (result?.serverError) {
          setIsSubmitting(false);
          throw new Error(result.serverError);
        }

        if (viewedProcessingPromptFileDialog) {
          router.push(prefixPath(emailAccountId, "/assistant?tab=test"));
        }

        mutate();
        setIsSubmitting(false);

        return result;
      };

      if (!viewedProcessingPromptFileDialog) {
        setIsDialogOpen(true);
      }
      setResult(undefined);

      toast.promise(() => saveRulesPromise(submitData), {
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
    },
    [mutate, router, viewedProcessingPromptFileDialog, emailAccountId],
  );

  const addExamplePrompt = useCallback(
    (example: string) => {
      if (editorRef.current) {
        editorRef.current.appendContent(`\n* ${example.trim()}`);
      }
    },
    [],
  );

  // const [showExamples, setShowExamples] = useState(false);

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

      <div
        className={cn(showExamples && "grid grid-cols-1 gap-4 sm:grid-cols-3")}
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className={showExamples ? "sm:col-span-2" : ""}
        >
          <Label className="font-cal text-xl leading-7">
            How your assistant should handle incoming emails
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Write rules for your AI assistant. For example: "{personas.other.promptArray.slice(0, 1).join("\n")}"
          </p>

          <div className="mt-1.5 space-y-4">
            <div>
              <Controller
                name="rulesPrompt"
                control={control}
                render={({ field }) => (
                  <div className="relative">
                    <Tiptap
                      ref={editorRef}
                      initialContent={field.value ?? ""}
                      onChange={() => {
                        // We'll handle the content via ref in onSubmit
                      }}
                      className="min-h-[300px]"
                      autofocus={false}
                    />
                    {errors.rulesPrompt && (
                      <p className="mt-1 text-sm text-destructive">
                        {errors.rulesPrompt.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primaryBlue"
                disabled={isSubmitting || isGenerating}
                loading={isSubmitting}
              >
                Save
              </Button>

              <Button variant="outline" onClick={onOpenPersonaDialog}>
                <UserPenIcon className="mr-2 size-4" />
                Choose persona
              </Button>

              <Tooltip content="Our AI will analyze your Gmail inbox and create a customized prompt for your assistant.">
                <Button
                  type="button"
                  variant="outline"
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

                        if (editorRef.current && result?.data?.rulesPrompt) {
                          const currentContent = editorRef.current.getMarkdown() || "";
                          const updatedContent = currentContent
                            ? `${currentContent}\n\n${result.data.rulesPrompt}`
                            : result.data.rulesPrompt;
                          
                          // Clear current content and set new content
                          editorRef.current.appendContent(`\n\n${result.data.rulesPrompt}`);
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
              </Tooltip>
            </div>

            {showClearWarning && (
              <Notice>
                <strong>Note:</strong> Deleting text will delete rules. Add new
                rules at the end to keep your existing rules.
              </Notice>
            )}
          </div>
        </form>

        {showExamples && <Examples onSelect={addExamplePrompt} />}
      </div>
    </div>
  );
}

export function PromptFile() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<
    RulesPromptResponse,
    { error: string }
  >("/api/user/rules/prompt");

  const { isModalOpen, setIsModalOpen } = useModal();

  const [persona, setPersona] = useState<string | null>(null);

  const personaPrompt = persona
    ? personas[persona as keyof typeof personas]?.prompt
    : undefined;

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <>
          <RulesPromptForm
            emailAccountId={emailAccountId}
            rulesPrompt={data.rulesPrompt}
            personaPrompt={personaPrompt}
            onOpenPersonaDialog={() => setIsModalOpen(true)}
            mutate={mutate}
          />
          <PersonaDialog
            isOpen={isModalOpen}
            setIsOpen={setIsModalOpen}
            onSelect={setPersona}
          />
        </>
      )}
    </LoadingContent>
  );
}

function PureExamples({ onSelect }: { onSelect: (example: string) => void }) {
  return (
    <div>
      <SectionHeader className="text-xl">Examples</SectionHeader>

      <ScrollArea className="mt-1.5 sm:h-[75vh] sm:max-h-[75vh]">
        <div className="grid grid-cols-1 gap-2">
          {examplePrompts.map((example) => {
            const { color } = getActionType(example);

            return (
              <Button
                key={example}
                variant="outline"
                onClick={() => onSelect(example)}
                className="h-auto w-full justify-start text-wrap py-2 text-left"
              >
                <div className="flex w-full items-start gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${color} mt-1.5 flex-shrink-0`}
                  />
                  <span className="flex-1">{example}</span>
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

const Examples = memo(PureExamples);

function getActionType(example: string): {
  type: string;
  color: string;
} {
  const lowerExample = example.toLowerCase();
  const color = getActionTypeColor(example);

  if (lowerExample.includes("forward")) {
    return { type: "forward", color };
  }
  if (lowerExample.includes("draft") || lowerExample.includes("reply")) {
    return { type: "reply", color };
  }
  if (lowerExample.includes("archive")) {
    return { type: "archive", color };
  }
  if (lowerExample.includes("spam") || lowerExample.includes("mark")) {
    return { type: "mark", color };
  }
  if (lowerExample.includes("label")) {
    return { type: "label", color };
  }

  // Default fallback
  return { type: "other", color };
}
