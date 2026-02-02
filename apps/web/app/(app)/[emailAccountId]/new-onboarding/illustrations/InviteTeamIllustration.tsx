"use client";

import { motion } from "framer-motion";
import { UsersIcon } from "lucide-react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

export function InviteTeamIllustration() {
  return (
    <div className="flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.5,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      >
        <IconCircle size="lg">
          <UsersIcon className="size-6" />
        </IconCircle>
      </motion.div>
    </div>
  );
}
