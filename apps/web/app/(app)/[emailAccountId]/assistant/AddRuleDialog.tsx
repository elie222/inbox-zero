"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptNew";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AddRuleDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" Icon={PlusIcon}>
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <RulesPrompt onSubmitted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
