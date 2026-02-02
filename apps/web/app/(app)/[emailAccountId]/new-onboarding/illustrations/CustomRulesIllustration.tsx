"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Forward,
  PenLine,
  Archive,
  MousePointer2,
  Star,
  Square,
  Tag,
} from "lucide-react";

const emails = [
  {
    id: 1,
    from: "Amazon Orders",
    subject: "Your receipt",
    snippet: "- Thank you for your purchase...",
    time: "10:30 AM",
    destination: 1,
  },
  {
    id: 2,
    from: "Sarah Chen",
    subject: "Quick question",
    snippet: "- Hey! Do you have a minute to...",
    time: "9:15 AM",
    destination: 2,
  },
  {
    id: 3,
    from: "TechNews Daily",
    subject: "Weekly digest",
    snippet: "- Your weekly roundup of the...",
    time: "Yesterday",
    destination: 0,
  },
  {
    id: 4,
    from: "Support Team",
    subject: "Ticket update",
    snippet: "- Your ticket #4521 has been...",
    time: "Yesterday",
    destination: 3,
  },
];

const destinations = [
  { name: "Label", icon: Tag },
  { name: "Forward", icon: Forward },
  { name: "Draft reply", icon: PenLine },
  { name: "Archive", icon: Archive },
];

type CursorPhase = "hidden" | "moving-to-email" | "dragging" | "returning";

export function CustomRulesIllustration() {
  const [currentEmail, setCurrentEmail] = useState(0);
  const [processedEmails, setProcessedEmails] = useState<number[]>([]);
  const [cursorPhase, setCursorPhase] = useState<CursorPhase>("hidden");
  const [draggingEmail, setDraggingEmail] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  const emailStartPos = { x: 0, y: 0 };
  const cursorRestPos = { x: 180, y: -20 };
  const cursorOffsetFromEmail = { x: 30, y: 20 };

  const getDestinationPosition = (destIndex: number) => {
    const xPositions = [-165, -55, 55, 165];
    return { x: xPositions[destIndex], y: 90 };
  };

  const getCursorPosition = () => {
    if (cursorPhase === "hidden") return cursorRestPos;
    if (cursorPhase === "moving-to-email") {
      return {
        x: emailStartPos.x + cursorOffsetFromEmail.x,
        y: emailStartPos.y + cursorOffsetFromEmail.y,
      };
    }
    if (cursorPhase === "dragging" && draggingEmail !== null) {
      const dest = getDestinationPosition(emails[draggingEmail].destination);
      return {
        x: dest.x + cursorOffsetFromEmail.x,
        y: dest.y + cursorOffsetFromEmail.y,
      };
    }
    if (cursorPhase === "returning") {
      return {
        x: emailStartPos.x + cursorOffsetFromEmail.x,
        y: emailStartPos.y + cursorOffsetFromEmail.y,
      };
    }
    return cursorRestPos;
  };

  useEffect(() => {
    setCurrentEmail(0);
    setProcessedEmails([]);
    setCursorPhase("hidden");
    setDraggingEmail(null);

    const timeouts: NodeJS.Timeout[] = [];
    let time = 400;

    timeouts.push(
      setTimeout(() => {
        setCurrentEmail(0);
      }, time),
    );
    time += 500;

    emails.forEach((email, index) => {
      timeouts.push(
        setTimeout(() => {
          setCursorPhase("moving-to-email");
        }, time),
      );
      time += 400;

      timeouts.push(
        setTimeout(() => {
          setDraggingEmail(index);
          setCursorPhase("dragging");
        }, time),
      );
      time += 600;

      timeouts.push(
        setTimeout(() => {
          setProcessedEmails((prev) => [...prev, index]);
          setDraggingEmail(null);

          if (index < emails.length - 1) {
            setCursorPhase("returning");
            setCurrentEmail(index + 1);
          } else {
            setCursorPhase("hidden");
          }
        }, time),
      );
      time += 400;
    });

    timeouts.push(
      setTimeout(() => {
        setAnimationKey((prev) => prev + 1);
      }, time + 1500),
    );

    return () => timeouts.forEach(clearTimeout);
  }, [animationKey]);

  const cursorPos = getCursorPosition();

  return (
    <div className="relative flex h-[220px] w-[480px] flex-col items-center">
      <div className="relative h-[70px] w-full flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {emails.map((email, index) => {
            if (processedEmails.includes(index)) return null;
            if (index > currentEmail) return null;

            const isDragging = draggingEmail === index;
            const destPos = isDragging
              ? getDestinationPosition(email.destination)
              : emailStartPos;

            return (
              <motion.div
                key={`email-${email.id}`}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  y: destPos.y,
                  x: destPos.x,
                  scale: isDragging ? 0.85 : 1,
                  rotate: isDragging ? -2 : 0,
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{
                  duration: 0.5,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="absolute z-10 flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-md"
              >
                <div className="flex shrink-0 items-center gap-1.5 pr-3">
                  <Square className="h-4 w-4 text-gray-300" />
                  <Star className="h-4 w-4 text-gray-300" />
                </div>

                <div className="flex h-5 w-[85px] shrink-0 items-center">
                  <span className="truncate text-[12px] font-semibold leading-none text-gray-900">
                    {email.from}
                  </span>
                </div>

                <div className="flex h-5 min-w-0 flex-1 items-center truncate">
                  <span className="text-[12px] font-medium text-gray-900">
                    {email.subject}
                  </span>
                  <span className="text-[12px] text-gray-500">
                    {" "}
                    {email.snippet}
                  </span>
                </div>

                <div className="shrink-0 pl-3 text-[11px] text-gray-500">
                  {email.time}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, x: cursorRestPos.x, y: cursorRestPos.y }}
          animate={{
            opacity: cursorPhase !== "hidden" ? 1 : 0,
            x: cursorPos.x,
            y: cursorPos.y,
          }}
          transition={{
            duration: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="absolute z-30 pointer-events-none"
        >
          <MousePointer2 className="h-5 w-5 text-gray-800 fill-white drop-shadow-md" />
        </motion.div>
      </div>

      <div className="flex gap-4 mt-6">
        {destinations.map((dest, index) => {
          const Icon = dest.icon;
          const isReceiving =
            draggingEmail !== null &&
            emails[draggingEmail]?.destination === index;

          return (
            <motion.div
              key={dest.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: isReceiving ? 1.05 : 1,
                borderColor: isReceiving ? "#9ca3af" : "#d1d5db",
              }}
              transition={{
                duration: 0.3,
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="z-0 flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-gray-50 text-gray-500 px-4 py-3"
              style={{ width: 100, height: 80 }}
            >
              <Icon className="h-5 w-5 mb-1.5" />
              <span className="text-[11px] font-medium">{dest.name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
