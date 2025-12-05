"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { saveWritingStyleAction } from "@/utils/actions/user";
import { regenerateWritingStyleAction } from "@/utils/actions/assess";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SparklesIcon } from "lucide-react";

export function WritingStyleSetting() {
  const { data, isLoading, error } = useEmailAccountFull();

  const hasWritingStyle = !!data?.writingStyle;

  return (
    <SettingCard
      title="Writing style"
      description="Your email writing style is used to generate drafts that match your tone and style."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <WritingStyleDialog currentWritingStyle={data?.writingStyle || ""}>
            <Button variant="outline" size="sm">
              {hasWritingStyle ? "Edit" : "Set"} Style
            </Button>
          </WritingStyleDialog>
        </LoadingContent>
      }
    />
  );
}

function WritingStyleDialog({
  children,
  currentWritingStyle,
}: {
  children: React.ReactNode;
  currentWritingStyle: string;
}) {
  const [open, setOpen] = useState(false);
  const { emailAccountId } = useAccount();
  const { mutate } = useEmailAccountFull();
  const [writingStyle, setWritingStyle] = useState(currentWritingStyle);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setWritingStyle(currentWritingStyle);
      }
      setOpen(isOpen);
    },
    [currentWritingStyle],
  );

  const { execute: executeSave, isExecuting: isSaving } = useAction(
    saveWritingStyleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Writing style saved!",
        });
        setOpen(false);
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError || "Failed to save writing style",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const { execute: executeAnalyze, isExecuting: isAnalyzing } = useAction(
    regenerateWritingStyleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Writing style analyzed! Refreshing...",
        });
        mutate().then((data) => {
          if (data?.writingStyle) {
            setWritingStyle(data.writingStyle);
          }
        });
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError || "Failed to analyze writing style",
        });
      },
    },
  );

  const handleSave = useCallback(() => {
    executeSave({ writingStyle });
  }, [executeSave, writingStyle]);

  const handleRegenerate = useCallback(() => {
    executeAnalyze();
  }, [executeAnalyze]);

  const handleClear = useCallback(() => {
    setWritingStyle("");
    executeSave({ writingStyle: "" });
  }, [executeSave]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Writing Style</DialogTitle>
          <DialogDescription>
            Your writing style helps the AI generate email drafts that match
            your tone and communication patterns. You can edit it manually or
            regenerate it based on your sent emails.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={isAnalyzing}
            >
              <SparklesIcon className="mr-2 h-4 w-4" />
              {isAnalyzing ? "Analyzing..." : "Regenerate from emails"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writingStyle">Writing Style</Label>
            <Textarea
              id="writingStyle"
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value)}
              placeholder="Your writing style will appear here after analysis, or you can enter it manually..."
              className="min-h-[300px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This includes your typical email length, formality level, common
              greetings, and notable writing traits.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClear} disabled={isSaving}>
              Clear
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
