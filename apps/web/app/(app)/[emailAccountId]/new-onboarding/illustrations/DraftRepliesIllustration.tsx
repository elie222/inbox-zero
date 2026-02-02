"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bold,
  Italic,
  Link,
  List,
  Smile,
  Paperclip,
  Reply,
  ChevronDown,
} from "lucide-react";

export function DraftRepliesIllustration() {
  const [stage, setStage] = useState(1);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    timeouts.push(setTimeout(() => setStage(2), 800));
    timeouts.push(setTimeout(() => setStage(3), 1400));
    timeouts.push(setTimeout(() => setStage(4), 2000));
    timeouts.push(setTimeout(() => setStage(5), 2600));
    timeouts.push(
      setTimeout(() => {
        setStage(1);
        setKey((k) => k + 1);
      }, 5500),
    );

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex h-[240px] w-[400px] flex-col justify-center gap-1.5">
      <motion.div
        key={`email-${key}`}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-100 text-[9px] font-semibold text-pink-600">
            SC
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-900 dark:text-gray-100">
                Sarah Chen
              </span>
              <span className="text-[9px] text-gray-400">10:30 AM</span>
            </div>
          </div>
        </div>

        <div className="px-3 pb-2 text-left text-[10px] leading-relaxed text-gray-700 dark:text-gray-300">
          Hi John, I wanted to follow up on the project timeline. When would be
          a good time to discuss the next steps?
        </div>
      </motion.div>

      <motion.div
        key={`compose-${key}`}
        initial={{ opacity: 0, height: 0 }}
        animate={{
          opacity: stage >= 2 ? 1 : 0,
          height: stage >= 2 ? "auto" : 0,
        }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800"
      >
        <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-1.5 dark:border-gray-700">
          <Reply className="h-3 w-3 text-gray-500" />
          <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
          <span className="text-[10px] text-gray-700 dark:text-gray-300">
            Sarah Chen
          </span>
        </div>

        <div className="px-3 py-2">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: stage >= 3 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="text-left text-[10px] leading-relaxed text-gray-800 dark:text-gray-200"
          >
            <p>Hi Sarah,</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: stage >= 4 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="mt-1 text-left text-[10px] leading-relaxed text-gray-800 dark:text-gray-200"
          >
            <p>
              Thanks for reaching out! I&apos;d be happy to discuss the project
              timeline. How about tomorrow at 2pm?
            </p>
            <p className="mt-1">Best, John</p>
          </motion.div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-2 py-2 dark:border-gray-700">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded bg-blue-600 px-2.5 py-0.5 text-[9px] font-medium text-white"
            >
              Send
            </button>
            <div className="ml-1 flex items-center">
              <button type="button" className="rounded p-0.5 text-gray-400">
                <Bold className="h-2.5 w-2.5" />
              </button>
              <button type="button" className="rounded p-0.5 text-gray-400">
                <Italic className="h-2.5 w-2.5" />
              </button>
              <button type="button" className="rounded p-0.5 text-gray-400">
                <Link className="h-2.5 w-2.5" />
              </button>
              <button type="button" className="rounded p-0.5 text-gray-400">
                <List className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center">
            <button type="button" className="rounded p-0.5 text-gray-400">
              <Paperclip className="h-2.5 w-2.5" />
            </button>
            <button type="button" className="rounded p-0.5 text-gray-400">
              <Smile className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
