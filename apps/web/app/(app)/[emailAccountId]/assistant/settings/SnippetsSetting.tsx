"use client";

import { SettingCard } from "@/components/SettingCard";
import { SnippetsManager } from "@/components/snippets/SnippetsManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SnippetsSetting() {
  return (
    <SettingCard
      description="Reuse saved replies in drafts by typing / followed by a shortcut."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Manage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Snippets</DialogTitle>
              <DialogDescription>
                Saved replies you can insert from compose with /.
              </DialogDescription>
            </DialogHeader>
            <SnippetsManager />
          </DialogContent>
        </Dialog>
      }
      title="Snippets"
    />
  );
}
