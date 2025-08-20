"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ButtonList } from "@/components/ButtonList";
import type { Personas } from "./examples";

export function PersonaDialog({
  isOpen,
  setIsOpen,
  onSelect,
  personas,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelect: (persona: string) => void;
  personas: Personas;
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
