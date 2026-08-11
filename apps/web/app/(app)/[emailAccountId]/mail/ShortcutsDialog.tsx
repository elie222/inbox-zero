"use client";

import { Kbd } from "@/components/Kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatShortcutKeys,
  getShortcutGroups,
  type ShortcutScope,
} from "@/lib/shortcuts/registry";

const SCOPES: readonly ShortcutScope[] = ["global", "mail"];

export type ShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Rendered straight from the shortcut registry, so a binding can never be
 * documented here without also being bound — or bound without being documented.
 */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const groups = getShortcutGroups(SCOPES);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Everything here works without the mouse.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(({ group, shortcuts }) => (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-primary">{group}</div>
              {shortcuts.map((shortcut) => (
                <div key={shortcut.id} className="flex items-center gap-3">
                  <Kbd className="min-w-9">{formatShortcutKeys(shortcut)}</Kbd>
                  <span className="text-sm text-foreground">
                    {shortcut.label}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
