import { PlusIcon } from "lucide-react";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptNew";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AddRuleDialog() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button size="sm" Icon={PlusIcon}>
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <RulesPrompt />
      </DialogContent>
    </Dialog>
  );
}
