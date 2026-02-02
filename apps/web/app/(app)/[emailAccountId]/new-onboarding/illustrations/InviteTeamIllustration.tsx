"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

const teamMembers = [
  { id: 1, name: "David Kim", email: "david@acme.com", color: "bg-blue-500" },
  {
    id: 2,
    name: "Sarah Chen",
    email: "sarah@acme.com",
    color: "bg-purple-500",
  },
  {
    id: 3,
    name: "Mike Johnson",
    email: "mike@acme.com",
    color: "bg-green-500",
  },
];

export function InviteTeamIllustration() {
  const [showTags, setShowTags] = useState([false, false, false]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const tagDelays = [400, 700, 1000];
    const timeouts: NodeJS.Timeout[] = [];

    tagDelays.forEach((delay, index) => {
      timeouts.push(
        setTimeout(() => {
          setShowTags((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }, delay),
      );
    });

    timeouts.push(
      setTimeout(() => {
        setShowTags([false, false, false]);
        setKey((k) => k + 1);
      }, 5000),
    );

    return () => timeouts.forEach(clearTimeout);
  }, [key]);

  return (
    <div className="flex h-[200px] w-[360px] flex-col justify-center gap-2">
      {teamMembers.map((member, index) => (
        <motion.div
          key={`${key}-${member.id}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.5,
            delay: index * 0.15,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-slate-800"
        >
          {/* Avatar */}
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${member.color} text-white`}
          >
            <span className="text-[9px] font-semibold">
              {member.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
          </div>

          {/* Name and email */}
          <div className="ml-3 flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-[12px] font-semibold text-gray-900 dark:text-gray-100">
              {member.name}
            </span>
            <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">
              {member.email}
            </span>
          </div>

          {/* Invite sent tag */}
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: showTags[index] ? 1 : 0,
              scale: showTags[index] ? 1 : 0.8,
            }}
            transition={{
              duration: 0.4,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="ml-3 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            <Send className="h-3 w-3" />
            Invite sent
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}
