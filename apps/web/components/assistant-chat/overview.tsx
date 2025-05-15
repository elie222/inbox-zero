import { motion } from "framer-motion";
import { MessageIcon } from "./icons";
import { Button } from "@/components/ui/button";

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
      <div className="flex max-w-xl flex-col gap-8 rounded-xl p-6 text-center leading-relaxed">
        <p className="flex flex-row items-center justify-center gap-4">
          <MessageIcon size={32} />
        </p>
        <h2 className="text-xl font-semibold">
          Hey, I'm your AI email assistant!
        </h2>
        <div className="space-y-4 text-left">
          <p className="font-medium">
            Ready to teach me how to better assist you with your emails?
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Teach me to recognize and categorize different types of emails
            </li>
            <li>Show me how to respond to specific emails on your behalf</li>
            <li>Tell me when to forward certain emails to others</li>
            <li>
              Share your preferences so I can manage your inbox intelligently
            </li>
          </ul>
        </div>

        <div className="pt-4">
          <p className="mb-4">Here are some ways I can help you:</p>
          <div className="flex flex-col gap-3">
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

        <p className="pt-2 text-sm text-muted-foreground">
          Or just tell me what you'd like me to help with in your own words
        </p>
      </div>
    </motion.div>
  );
};
