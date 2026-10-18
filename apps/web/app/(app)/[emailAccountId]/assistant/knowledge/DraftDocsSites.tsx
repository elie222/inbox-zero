"use client";

import { type FormEvent, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateDraftDocsUrlsAction } from "@/utils/actions/knowledge";
import { getActionErrorMessage } from "@/utils/error";

export function DraftDocsSites() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const [newUrl, setNewUrl] = useState("");

  const { execute, isExecuting } = useAction(
    updateDraftDocsUrlsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        setNewUrl("");
        mutate();
      },
      onError: (error) => {
        toastError({
          title: "Failed to update documentation sites",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  const urls: string[] = data?.draftDocsUrls ?? [];

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!newUrl.trim()) return;
    execute({ urls: [...urls, newUrl] });
  };

  return (
    <div className="mt-6 space-y-2">
      <div>
        <h3 className="font-medium">Documentation sites</h3>
        <p className="text-sm text-muted-foreground">
          Public docs the assistant can look things up in when drafting replies.
          Only pages under these URLs are read.
        </p>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        <ul className="space-y-1">
          {urls.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              <span className="truncate">{url}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${url}`}
                disabled={isExecuting}
                onClick={() =>
                  execute({ urls: urls.filter((item) => item !== url) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={onAdd} className="flex gap-2">
          <Input
            inputMode="url"
            className="h-9"
            placeholder="https://docs.example.com"
            value={newUrl}
            onChange={(event) => setNewUrl(event.target.value)}
          />
          <Button type="submit" size="sm" loading={isExecuting}>
            <Plus className="mr-2 h-4 w-4" />
            Add site
          </Button>
        </form>
      </LoadingContent>
    </div>
  );
}
