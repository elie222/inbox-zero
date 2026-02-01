"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Forward,
  Archive,
  Tag,
  Mail,
  CheckCircle,
  Receipt,
  Newspaper,
  Megaphone,
} from "lucide-react";

const rules = [
  {
    id: 1,
    name: "Receipts",
    condition: "From: receipts@",
    action: "Forward",
    actionIcon: Forward,
    emailIcon: Receipt,
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    id: 2,
    name: "Newsletters",
    condition: "Category: Newsletter",
    action: "Label & Archive",
    actionIcon: Archive,
    emailIcon: Newspaper,
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: 3,
    name: "Marketing",
    condition: "From: marketing@",
    action: "Auto-label",
    actionIcon: Tag,
    emailIcon: Megaphone,
    color: "bg-orange-100 text-orange-600",
  },
];

export function CustomRulesIllustration() {
  const [stage, setStage] = useState(0);
  const [activeRule, setActiveRule] = useState<number | null>(null);
  const [processedRules, setProcessedRules] = useState<number[]>([]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    // Stage 0: Rules appear
    // Stage 1: First email arrives, matches rule 1
    // Stage 2: Rule 1 processes, checkmark appears
    // Stage 3: Second email arrives, matches rule 2
    // Stage 4: Rule 2 processes, checkmark appears
    // Stage 5: Third email arrives, matches rule 3
    // Stage 6: Rule 3 processes, checkmark appears

    timeouts.push(setTimeout(() => setStage(1), 800));
    timeouts.push(
      setTimeout(() => {
        setActiveRule(0);
      }, 1200),
    );
    timeouts.push(
      setTimeout(() => {
        setProcessedRules([0]);
        setActiveRule(null);
        setStage(2);
      }, 1800),
    );

    timeouts.push(setTimeout(() => setStage(3), 2400));
    timeouts.push(
      setTimeout(() => {
        setActiveRule(1);
      }, 2800),
    );
    timeouts.push(
      setTimeout(() => {
        setProcessedRules([0, 1]);
        setActiveRule(null);
        setStage(4);
      }, 3400),
    );

    timeouts.push(setTimeout(() => setStage(5), 4000));
    timeouts.push(
      setTimeout(() => {
        setActiveRule(2);
      }, 4400),
    );
    timeouts.push(
      setTimeout(() => {
        setProcessedRules([0, 1, 2]);
        setActiveRule(null);
        setStage(6);
      }, 5000),
    );

    // Reset
    timeouts.push(
      setTimeout(() => {
        setStage(0);
        setActiveRule(null);
        setProcessedRules([]);
        setKey((k) => k + 1);
      }, 7000),
    );

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex h-[200px] w-[420px] items-center justify-center gap-4">
      {/* Email indicator */}
      <div className="relative flex h-[160px] w-[100px] flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {(stage === 1 || stage === 3 || stage === 5) && (
            <motion.div
              key={`email-${stage}-${key}`}
              initial={{ opacity: 0, y: -30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.8 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex flex-col items-center gap-2"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm">
                <Mail className="h-6 w-6 text-gray-600" />
              </div>
              <span className="text-[9px] font-medium text-gray-500">
                New email
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Arrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 1 ? 0.5 : 0 }}
          className="absolute right-0 top-1/2 -translate-y-1/2"
        >
          <svg
            className="h-4 w-6 text-gray-300"
            viewBox="0 0 24 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M0 8h20M14 2l6 6-6 6" />
          </svg>
        </motion.div>
      </div>

      {/* Rules list */}
      <div className="flex h-[160px] w-[280px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            Your Rules
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1.5">
          {rules.map((rule, index) => {
            const isActive = activeRule === index;
            const isProcessed = processedRules.includes(index);
            const ActionIcon = rule.actionIcon;

            return (
              <motion.div
                key={`rule-${key}-${rule.id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: isActive ? 1.02 : 1,
                  borderColor: isActive ? "#3b82f6" : "#e5e7eb",
                }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.1,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  isActive
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 bg-white dark:border-gray-600 dark:bg-slate-700"
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${rule.color}`}
                >
                  <rule.emailIcon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-medium text-gray-900 dark:text-gray-100">
                    {rule.name}
                  </div>
                  <div className="text-[8px] text-gray-500 dark:text-gray-400">
                    {rule.condition}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isProcessed ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 25,
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-0.5 text-[8px] text-gray-400">
                      <ActionIcon className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
