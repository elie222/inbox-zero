import { motion } from "framer-motion";
import { MessageIcon } from "./icons";
import { Button } from "@/components/ui/button";
import { MessageText, TypographyH3 } from "@/components/Typography";
import { ExamplesDialog } from "./examples-dialog";

export const Overview = ({
  setInput,
}: {
  setInput: (input: string) => void;
}) => {
  return (
    <motion.div
      key="overview"
      className="mx-auto flex h-full max-w-3xl items-center justify-center"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="flex max-w-xl flex-col rounded-xl p-6 text-center leading-relaxed">
        <p className="flex flex-row items-center justify-center gap-4">
          <MessageIcon size={32} />
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
    </motion.div>
  );
};
