"use client";

import { motion } from "framer-motion";
import { Mail } from "lucide-react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export function ChatIllustration() {
  return (
    <div className="flex h-[240px] w-full max-w-[360px] sm:w-[400px] sm:max-w-none flex-col justify-center gap-2">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-sm"
      >
        Archive all newsletters from last week
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.7, ease: EASE }}
        className="self-start max-w-[85%]"
      >
        <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-3 py-2 text-left shadow-sm dark:border-gray-700 dark:bg-slate-800">
          <div className="text-[11px] leading-snug text-gray-800 dark:text-gray-200">
            Found 12 newsletters from last week. Archiving now.
          </div>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3, delay: 1.5 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-900">
              <Mail className="h-3 w-3 text-gray-500" />
              <span className="text-[10px] text-gray-600 dark:text-gray-400">
                12 emails archived
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 2.1, ease: EASE }}
        className="mt-2 flex items-center justify-center gap-1.5 self-center rounded-full border border-gray-200 bg-white px-2.5 py-1 shadow-sm dark:border-gray-700 dark:bg-slate-800"
      >
        <SlackIcon className="h-3 w-3" />
        <TelegramIcon className="h-3 w-3" />
        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
          Also in Slack and Telegram
        </span>
      </motion.div>
    </div>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.272 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.161 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
      />
      <path
        fill="#ECB22E"
        d="M15.161 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.161 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.272a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.317A2.527 2.527 0 0 1 24 15.161a2.528 2.528 0 0 1-2.522 2.523h-6.317z"
      />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.491 11.74l11.57-4.461c.537-.194 1.006.131.832.943l.001-.001-1.97 9.281c-.146.658-.537.818-1.084.508l-3-2.211-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.334-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953z"
      />
    </svg>
  );
}
