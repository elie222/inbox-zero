import { MessageText } from "@/components/Typography";
import { ButtonLoader } from "@/components/Loading";

export function LoadProgress() {
  return (
    <div className="mr-4 flex max-w-xs items-center">
      <ButtonLoader />
      <MessageText className="hidden sm:block">
        Loading new emails...
      </MessageText>
    </div>
  );
}
