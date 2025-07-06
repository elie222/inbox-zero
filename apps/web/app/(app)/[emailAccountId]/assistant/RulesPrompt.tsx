"use client";

import { useCallback, useEffect, useState, memo, useRef } from "react";
import { useLocalStorage } from "usehooks-ts";
import { SparklesIcon, UserPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
    watch,
    reset,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt: rulesPrompt || undefined },
  });

  const currentPrompt = watch("rulesPrompt");

  useEffect(() => {
    reset({ rulesPrompt: rulesPrompt || undefined });
  }, [rulesPrompt, reset]);

  useEffect(() => {
    setShowClearWarning(!!rulesPrompt && currentPrompt === "");
  }, [currentPrompt, rulesPrompt]);

  useEffect(() => {
    if (!personaPrompt) return;

    const currentPrompt = getValues("rulesPrompt") || "";
    const updatedPrompt = `${currentPrompt}\n\n${personaPrompt}`.trim();
    setValue("rulesPrompt", updatedPrompt);
  }, [personaPrompt, getValues, setValue]);

  const router = useRouter();

  const onSubmit = useCallback(
    async (data: SaveRulesPromptBody) => {
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
    },
    [mutate, router, viewedProcessingPromptFileDialog, emailAccountId],
  );

  const addExamplePrompt = useCallback(
    (example: string) => {
      setValue(
        "rulesPrompt",
        `${getValues("rulesPrompt")}\n* ${example.trim()}`.trim(),
      );
    },
    [setValue, getValues],
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

          <div className="mt-1.5 space-y-4">
            <Input
              className="min-h-[300px] border-input"
              registerProps={register("rulesPrompt", { required: true })}
              name="rulesPrompt"
              type="text"
              autosizeTextarea
              rows={30}
              maxRows={50}
              error={errors.rulesPrompt}
              placeholder={`Here's an example of what your prompt might look like:

${personas.other.promptArray.slice(0, 1).join("\n")}

If someone asks about pricing, reply with:
---
Hi NAME!

I'm currently offering a 10% discount for the first 10 customers.

Let me know if you're interested!
---`}
            />

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

                        const currentPrompt = getValues("rulesPrompt");
                        const updatedPrompt = currentPrompt
                          ? `${currentPrompt}\n\n${result?.data?.rulesPrompt}`
                          : result?.data?.rulesPrompt;
                        setValue("rulesPrompt", updatedPrompt?.trim() || "");

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

  return { type: "other", color };
}
