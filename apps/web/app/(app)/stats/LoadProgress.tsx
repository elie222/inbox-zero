import { Loader2 } from "lucide-react";
import { MessageText } from "@/components/Typography";

export function LoadProgress(props: {}) {
  return (
    <div className="mr-4 flex max-w-xs items-center">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <MessageText>Loading new emails...</MessageText>
    </div>
  );
}
