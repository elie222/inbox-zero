import { motion } from "framer-motion";
import { MessageIcon } from "./icons";
import { Button } from "@/components/ui/button";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="mx-auto max-w-3xl md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="flex max-w-xl flex-col gap-8 rounded-xl p-6 text-center leading-relaxed">
        <p className="flex flex-row items-center justify-center gap-4">
          <MessageIcon size={32} />
        </p>
        <p>Set up your AI assistant.</p>

        <Button>Choose from examples</Button>
      </div>
    </motion.div>
  );
};
