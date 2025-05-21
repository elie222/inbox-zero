"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ButtonList } from "@/components/ButtonList";
import { personas } from "@/app/(app)/[emailAccountId]/assistant/examples";

export function PersonaDialog({
  isOpen,
  setIsOpen,
  onSelect,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelect: (persona: string) => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogTitle className="text-lg font-medium">
          Choose a persona
        </DialogTitle>

        <ButtonList
          items={Object.entries(personas).map(([id, persona]) => ({
            id,
            name: persona.label,
          }))}
          onSelect={(id) => {
            onSelect(id);
            setIsOpen(false);
          }}
          emptyMessage=""
          columns={3}
        />
      </DialogContent>
    </Dialog>
  );
}
