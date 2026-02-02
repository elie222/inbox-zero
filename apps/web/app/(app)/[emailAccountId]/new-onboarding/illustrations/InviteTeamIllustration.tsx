"use client";

import { motion } from "framer-motion";
import { Send } from "lucide-react";

export function InviteTeamIllustration() {
  return (
    <div className="relative flex h-[200px] w-[360px] items-center justify-center">
      {/* Expanding rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-gray-200"
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{ width: 180, height: 180, opacity: [0, 0.5, 0] }}
          transition={{
            duration: 2.5,
            delay: i * 0.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Paper airplane */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, x: -30, y: 30 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        transition={{
          duration: 0.8,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="relative z-10"
      >
        <motion.div
          animate={{ y: [-2, 2, -2] }}
          transition={{
            duration: 3,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          <Send className="h-20 w-20 text-gray-400" />
        </motion.div>
      </motion.div>
    </div>
  );
}
