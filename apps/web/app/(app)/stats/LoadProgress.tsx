import { MessageText } from "@/components/Typography";
import { ButtonLoader } from "@/components/ui/button";

export function LoadProgress(props: {}) {
  return (
    <div className="mr-4 flex max-w-xs items-center">
      <ButtonLoader />
      <MessageText>Loading new emails...</MessageText>
    </div>
  );
}
