"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Forward, PenLine, Archive, MousePointer2 } from "lucide-react";

const emails = [
  { id: 1, from: "Amazon", subject: "Your receipt", destination: 0 },
  { id: 2, from: "Sarah Chen", subject: "Quick question", destination: 1 },
  { id: 3, from: "Newsletter", subject: "Weekly digest", destination: 2 },
  { id: 4, from: "Support", subject: "Ticket update", destination: 1 },
];

const destinations = [
  {
    name: "Forward",
    icon: Forward,
    color: "bg-emerald-100 text-emerald-600 border-emerald-200",
  },
  {
    name: "Draft",
    icon: PenLine,
    color: "bg-blue-100 text-blue-600 border-blue-200",
  },
  {
    name: "Archive",
    icon: Archive,
    color: "bg-purple-100 text-purple-600 border-purple-200",
  },
];

export function CustomRulesIllustration() {
  const [stage, setStage] = useState(0);
  const [currentEmail, setCurrentEmail] = useState(0);
  const [processedEmails, setProcessedEmails] = useState<number[]>([]);
  const [draggingEmail, setDraggingEmail] = useState<number | null>(null);
  const [destinationCounts, setDestinationCounts] = useState([0, 0, 0]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];
    let time = 600;

    emails.forEach((email, index) => {
      // Start dragging
      timeouts.push(
        setTimeout(() => {
          setDraggingEmail(index);
          setStage(index * 3 + 1);
        }, time),
      );
      time += 600;

      // Drop into destination
      timeouts.push(
        setTimeout(() => {
          setDraggingEmail(null);
          setProcessedEmails((prev) => [...prev, index]);
          setDestinationCounts((prev) => {
            const next = [...prev];
            next[email.destination]++;
            return next;
          });
          setStage(index * 3 + 2);
        }, time),
      );
      time += 400;

      // Show next email
      if (index < emails.length - 1) {
        timeouts.push(
          setTimeout(() => {
            setCurrentEmail(index + 1);
            setStage(index * 3 + 3);
          }, time),
        );
        time += 300;
      }
    });

    // Reset
    timeouts.push(
      setTimeout(() => {
        setStage(0);
        setCurrentEmail(0);
        setProcessedEmails([]);
        setDraggingEmail(null);
        setDestinationCounts([0, 0, 0]);
        setKey((k) => k + 1);
      }, time + 1500),
    );

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const getDestinationPosition = (destIndex: number) => {
    const xPositions = [-95, 0, 95];
    return { x: xPositions[destIndex], y: 75 };
  };

  return (
    <div className="relative flex h-[200px] w-[320px] flex-col items-center">
      {/* Email cards at top */}
      <div className="relative h-[70px] w-full flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {emails.map((email, index) => {
            if (processedEmails.includes(index)) return null;
            if (index > currentEmail) return null;

            const isDragging = draggingEmail === index;
            const destPos = isDragging
              ? getDestinationPosition(email.destination)
              : { x: 0, y: 0 };

            return (
              <motion.div
                key={`email-${key}-${email.id}`}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{
                  opacity: isDragging ? 0.9 : 1,
                  y: isDragging ? destPos.y : 0,
                  x: isDragging ? destPos.x : 0,
                  scale: isDragging ? 0.85 : 1,
                  rotate: isDragging ? -2 : 0,
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{
                  duration: 0.5,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="absolute flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[8px] font-semibold text-gray-600">
                  {email.from.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-gray-900">
                    {email.from}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {email.subject}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Cursor */}
        <AnimatePresence>
          {draggingEmail !== null && (
            <motion.div
              key={`cursor-${key}-${draggingEmail}`}
              initial={{ opacity: 0, x: 40, y: -10 }}
              animate={{
                opacity: 1,
                x:
                  getDestinationPosition(emails[draggingEmail].destination).x +
                  50,
                y:
                  getDestinationPosition(emails[draggingEmail].destination).y +
                  10,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute z-20"
            >
              <MousePointer2 className="h-4 w-4 text-gray-700 fill-white drop-shadow-sm" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Destination boxes */}
      <div className="flex gap-3 mt-4">
        {destinations.map((dest, index) => {
          const Icon = dest.icon;
          const count = destinationCounts[index];
          const justReceived =
            draggingEmail !== null &&
            emails[draggingEmail]?.destination === index;

          return (
            <motion.div
              key={dest.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: justReceived ? 1.05 : 1,
              }}
              transition={{
                duration: 0.3,
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-3 ${dest.color}`}
              style={{ width: 85, height: 70 }}
            >
              <Icon className="h-4 w-4 mb-1" />
              <span className="text-[9px] font-medium">{dest.name}</span>
              <motion.span
                key={`count-${count}`}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="text-[10px] font-semibold mt-0.5"
              >
                {count}
              </motion.span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
