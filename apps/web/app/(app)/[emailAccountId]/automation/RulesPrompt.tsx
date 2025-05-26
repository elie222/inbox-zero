"use client";

import { useCallback, useEffect, useState } from "react";
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
import { AutomationOnboarding } from "@/app/(app)/[emailAccountId]/automation/AutomationOnboarding";
import { personas } from "@/app/(app)/[emailAccountId]/automation/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/automation/PersonaDialog";
import { useModal } from "@/hooks/useModal";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/automation/ProcessingPromptFileDialog";
import { AlertBasic } from "@/components/Alert";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { Label } from "@/components/ui/label";

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
          <>
            <RulesPromptForm
              emailAccountId={emailAccountId}
              rulesPrompt={data.rulesPrompt}
              personaPrompt={personaPrompt}
              mutate={mutate}
              onOpenPersonaDialog={onOpenPersonaDialog}
            />
            <AutomationOnboarding
              onComplete={() => {
                if (!data.rulesPrompt) onOpenPersonaDialog();
              }}
            />
          </>
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
}: {
  emailAccountId: string;
  rulesPrompt: string | null;
  personaPrompt?: string;
  mutate: () => void;
  onOpenPersonaDialog: () => void;
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
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt: rulesPrompt || undefined },
  });

  const currentPrompt = watch("rulesPrompt");

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

      {showClearWarning && (
        <AlertBasic
          className="mb-2"
          variant="blue"
          title="Warning: Deleting text will remove or disable rules"
          description="Add new rules at the end to keep your existing rules."
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 sm:col-span-2">
          <Input
            className="min-h-[300px]"
            registerProps={register("rulesPrompt", { required: true })}
            name="rulesPrompt"
            type="text"
            autosizeTextarea
            rows={30}
            maxRows={50}
            error={errors.rulesPrompt}
            placeholder={`Here's an example of what your prompt might look like:

${personas.other.prompt}

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
        </div>
      </form>
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
          <Label>
            How your AI personal assistant should handle incoming emails
          </Label>
          <div className="mt-1">
            <RulesPromptForm
              emailAccountId={emailAccountId}
              rulesPrompt={data.rulesPrompt}
              personaPrompt={personaPrompt}
              onOpenPersonaDialog={() => setIsModalOpen(true)}
              mutate={mutate}
            />
          </div>
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
