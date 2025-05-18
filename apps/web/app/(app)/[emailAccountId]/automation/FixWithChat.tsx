import { HammerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FixWithChat() {
  return (
    <Button variant="outline">
      <HammerIcon className="mr-2 size-4" />
      Fix
    </Button>
  );
}
