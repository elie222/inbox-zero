"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
  useRef,
} from "react";
import { PlusIcon, UserPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { getPersonas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { useModal } from "@/hooks/useModal";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useRules } from "@/hooks/useRules";
import { ExamplesGrid } from "@/app/(app)/[emailAccountId]/assistant/ExamplesList";
import { toastError } from "@/components/Toast";
import { AvailableActionsPanel } from "@/app/(app)/[emailAccountId]/assistant/AvailableActionsPanel";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { convertMentionsToLabels } from "@/utils/mention";

export function RulesPrompt({ onSubmitted }: { onSubmitted?: () => void }) {
  const { provider } = useAccount();
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
        provider={provider}
        examples={examples}
        onOpenPersonaDialog={onOpenPersonaDialog}
        onHideExamples={() => setPersona(null)}
        onSubmitted={onSubmitted}
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
  provider,
  examples,
  onOpenPersonaDialog,
  onHideExamples,
  onSubmitted,
}: {
  provider: string;
  examples?: string[];
  onOpenPersonaDialog: () => void;
  onHideExamples: () => void;
  onSubmitted?: () => void;
}) {
  const { mutate } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();
  const { chat, submitTextMessage } = useChat();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const ruleDialog = useDialogState();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") return;
    const prompt = convertMentionsToLabels(markdown).trim();
    if (prompt === "") {
      toastError({
        description: "Please enter a prompt to create rules",
      });
      return;
    }

    if (chat.status !== "ready") {
      toastError({
        description: "Please wait for the current chat response to finish.",
      });
      return;
    }

    setIsSubmitting(true);
    openChatSidebar({ isMobile, setOpen, setOpenMobile });

    let submitted = false;
    try {
      await submitTextMessage(`Create these email rules:\n\n${prompt}`);
      submitted = true;
      onSubmitted?.();
    } catch {
      toastError({ description: "Could not send this prompt to chat." });
    } finally {
      if (!submitted || !onSubmitted) setIsSubmitting(false);
    }
  }, [
    chat.status,
    isMobile,
    onSubmitted,
    setOpen,
    setOpenMobile,
    submitTextMessage,
  ]);

  const addExamplePrompt = useCallback((example: string) => {
    editorRef.current?.appendText(`\n* ${example.trim()}`);
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,250px] gap-6">
        <div className="grid gap-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onSubmit();
            }}
          >
            <Label className="font-title text-xl leading-7">
              Add new rules
            </Label>

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
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={examples ? onHideExamples : onOpenPersonaDialog}
                >
                  <UserPenIcon className="mr-2 size-4" />
                  {examples ? "Hide examples" : "Choose from examples"}
                </Button>

                <Button
                  type="button"
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

        <div className="pr-4">
          <AvailableActionsPanel />
        </div>
      </div>

      {examples && (
        <div className="mt-2">
          <Label className="font-title text-xl leading-7">Examples</Label>
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
    </div>
  );
}

function openChatSidebar({
  isMobile,
  setOpen,
  setOpenMobile,
}: {
  isMobile: boolean;
  setOpen: Dispatch<SetStateAction<string[]>>;
  setOpenMobile: Dispatch<SetStateAction<string[]>>;
}) {
  const openChat = (openSidebars: string[]) =>
    openSidebars.includes("chat-sidebar")
      ? openSidebars
      : [...openSidebars, "chat-sidebar"];

  if (isMobile) {
    setOpenMobile(openChat);
  } else {
    setOpen(openChat);
  }
}
