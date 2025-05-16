import { motion } from "framer-motion";
import type { UseChatHelpers } from "@ai-sdk/react";
import { MessageIcon } from "./icons";
import { Button } from "@/components/ui/button";
import { MessageText, TypographyH3 } from "@/components/Typography";

export const Overview = ({
  setInput,
}: {
  setInput: UseChatHelpers["setInput"];
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
          Hey, I'm your AI email assistant!
        </TypographyH3>

        <MessageText className="mt-4">
          Teach me how to handle your incoming emails for you
        </MessageText>

        <div className="flex flex-col gap-3 pt-8">
          <OverviewButton
            label="Label all pitch decks and investor updates"
            message="When I get an email with a pitch deck or investor update, label it as 'Pitch Deck'"
            setInput={setInput}
          />
          <OverviewButton
            label="Respond to sponsorship inquiries with my pricing"
            message="When I get an email with a sponsorship inquiry, respond with the link to my pricing deck: https://www.example.com/pricing-deck"
            setInput={setInput}
          />
          <OverviewButton
            label="Forward all receipts to my accountant"
            message="When I get an email with a receipt, forward it to my accountant: jane@example.com"
            setInput={setInput}
          />
        </div>
      </div>
    </motion.div>
  );
};

function OverviewButton({
  label,
  setInput,
  message,
}: {
  label: string;
  setInput: UseChatHelpers["setInput"];
  message: string;
}) {
  return (
    <Button
      variant="outline"
      className="justify-start text-left"
      onClick={() => {
        setInput(message);
      }}
    >
      {label}
    </Button>
  );
}
