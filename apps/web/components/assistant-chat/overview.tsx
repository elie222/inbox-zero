import { motion } from "framer-motion";
import { MessageIcon } from "./icons";
import { Button } from "@/components/ui/button";
import { MessageText, TypographyH3 } from "@/components/Typography";

export const Overview = () => {
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
          Hey, I'm your AI email assistant!
        </TypographyH3>

        <MessageText className="mt-4">
          Teach me how to handle your incoming emails for you
        </MessageText>

        <div className="flex flex-col gap-3 pt-8">
          <Button variant="outline" className="justify-start text-left">
            Label all pitch decks and investor updates
          </Button>
          <Button variant="outline" className="justify-start text-left">
            Respond to sponsorship inquiries with my pricing
          </Button>
          <Button variant="outline" className="justify-start text-left">
            Forward all receipts to my accountant
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
