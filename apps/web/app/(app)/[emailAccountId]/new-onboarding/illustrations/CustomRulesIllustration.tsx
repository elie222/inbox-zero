"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, Square, Forward, Archive, Tag } from "lucide-react";

const emails = [
  {
    id: 1,
    from: "Amazon",
    subject: "Your receipt",
    snippet: "- Order #123-456 has been...",
    time: "10:30 AM",
    action: "Forward",
    actionIcon: Forward,
    actionColor: "bg-emerald-600",
  },
  {
    id: 2,
    from: "TechNews Daily",
    subject: "Weekly digest",
    snippet: "- Your weekly roundup of the latest...",
    time: "9:15 AM",
    action: "Archive",
    actionIcon: Archive,
    actionColor: "bg-purple-600",
  },
  {
    id: 3,
    from: "Sales Team",
    subject: "Special offer",
    snippet: "- Limited time deal just for you...",
    time: "Yesterday",
    action: "Label",
    actionIcon: Tag,
    actionColor: "bg-orange-500",
  },
];

export function CustomRulesIllustration() {
  const [showActions, setShowActions] = useState([false, false, false]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const actionDelays = [1200, 1800, 2400];
    const timeouts: NodeJS.Timeout[] = [];

    actionDelays.forEach((delay, index) => {
      timeouts.push(
        setTimeout(() => {
          setShowActions((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }, delay),
      );
    });

    timeouts.push(
      setTimeout(() => {
        setShowActions([false, false, false]);
        setKey((k) => k + 1);
      }, 5000),
    );

    return () => timeouts.forEach(clearTimeout);
  }, [key]);

  return (
    <div className="flex h-[200px] w-[420px] flex-col justify-center gap-2">
      {emails.map((email, index) => {
        const ActionIcon = email.actionIcon;

        return (
          <motion.div
            key={`${key}-${email.id}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.5,
              delay: index * 0.15,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-slate-800"
          >
            {/* Checkbox and star */}
            <div className="flex shrink-0 items-center gap-1.5 pr-3">
              <Square className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              <Star className="h-4 w-4 text-gray-300 dark:text-gray-600" />
            </div>

            {/* Sender */}
            <div className="flex h-5 w-[90px] shrink-0 items-center">
              <span className="truncate text-[12px] font-semibold leading-none text-gray-900 dark:text-gray-100">
                {email.from}
              </span>
            </div>

            {/* Action badge */}
            <div className="flex h-5 shrink-0 items-center px-2">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: showActions[index] ? 1 : 0,
                  scale: showActions[index] ? 1 : 0.8,
                }}
                transition={{
                  duration: 0.4,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[9px] font-medium leading-none text-white ${email.actionColor}`}
              >
                <ActionIcon className="h-2.5 w-2.5" />
                {email.action}
              </motion.span>
            </div>

            {/* Subject and snippet */}
            <div className="flex h-5 min-w-0 flex-1 items-center truncate">
              <span className="text-[12px] font-medium text-gray-900 dark:text-gray-100">
                {email.subject}
              </span>
              <span className="text-[12px] text-gray-500 dark:text-gray-400">
                {" "}
                {email.snippet}
              </span>
            </div>

            {/* Time */}
            <div className="shrink-0 pl-3 text-[11px] text-gray-500 dark:text-gray-400">
              {email.time}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
