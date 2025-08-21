import { Button } from "@/components/ui/button";
import { MessageText, TypographyH3 } from "@/components/Typography";
import { ExamplesDialog } from "./examples-dialog";
import { MessageCircleIcon } from "lucide-react";

export const Overview = ({
  setInput,
}: {
  setInput: (input: string) => void;
}) => {
  return (
    <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
      <div className="flex max-w-xl flex-col rounded-xl p-6 text-center leading-relaxed">
        <p className="flex flex-row items-center justify-center gap-4">
          <MessageCircleIcon size={32} />
        </p>

        <TypographyH3 className="mt-8">
          Hey, I'm your email assistant!
        </TypographyH3>

        <MessageText className="mt-4 text-base">
          Teach me how to handle your incoming emails for you
        </MessageText>

        <div className="pt-8">
          <ExamplesDialog setInput={setInput}>
            <Button variant="primaryBlue">Choose from examples</Button>
          </ExamplesDialog>
        </div>
      </div>
    </div>
  );
};
