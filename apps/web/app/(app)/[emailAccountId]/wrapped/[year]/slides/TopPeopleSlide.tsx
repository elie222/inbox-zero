"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import type { SlideProps } from "./types";

export function TopPeopleSlide({ data, year: _year }: SlideProps) {
  const topContacts = data.people.topContacts.slice(0, 5);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-900 via-pink-900 to-fuchsia-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-2"
      >
        Your Top Correspondents
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white/60 mb-8"
      >
        The people you emailed with the most
      </motion.p>

      <div className="w-full max-w-lg space-y-4">
        {topContacts.map((contact, index) => (
          <motion.div
            key={contact.email}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="flex items-center gap-4 bg-white/10 rounded-lg p-4"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center font-bold text-white">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">
                {contact.name || contact.email}
              </p>
              {contact.name && (
                <p className="text-sm text-white/60 truncate">
                  {contact.email}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">
                {contact.count.toLocaleString()}
              </p>
              <p className="text-xs text-white/50">emails</p>
            </div>
          </motion.div>
        ))}
      </div>

      {topContacts.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-white/60"
        >
          No contact data available
        </motion.p>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 flex items-center gap-4 text-white/60"
      >
        <Users className="h-5 w-5" />
        <span>
          You connected with {data.people.uniqueSenders.toLocaleString()} unique
          people
        </span>
      </motion.div>
    </div>
  );
}
