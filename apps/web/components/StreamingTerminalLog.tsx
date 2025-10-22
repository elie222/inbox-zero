"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

interface StreamingTerminalLogProps {
  messages: string[];
  characterDelay?: number;
  lineDelay?: number;
  onComplete?: () => void;
  autoScroll?: boolean;
}

interface LineToShow {
  text: string;
  startDelay: number;
}

export function StreamingTerminalLog({
  messages,
  characterDelay = 0.03,
  lineDelay = 0.3,
  onComplete,
  autoScroll = true,
}: StreamingTerminalLogProps) {
  const [linesToShow, setLinesToShow] = useState<LineToShow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate when each line should start animating
  useEffect(() => {
    let cumulativeDelay = 0;
    const lines: LineToShow[] = [];

    messages.forEach((message) => {
      lines.push({
        text: message,
        startDelay: cumulativeDelay,
      });

      // Add delay for this line's characters plus pause before next line
      if (message === "") {
        cumulativeDelay += lineDelay;
      } else {
        cumulativeDelay += message.length * characterDelay + lineDelay;
      }
    });

    setLinesToShow(lines);

    // Trigger onComplete after all animations finish
    if (onComplete) {
      const totalDuration = cumulativeDelay * 1000 + 500; // Convert to ms and add buffer
      const timer = setTimeout(onComplete, totalDuration);
      return () => clearTimeout(timer);
    }
  }, [messages, characterDelay, lineDelay, onComplete]);

  // Auto-scroll to bottom as content appears
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;

    const scrollToBottom = () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    };

    // Scroll periodically during animation
    const interval = setInterval(scrollToBottom, 100);
    return () => clearInterval(interval);
  }, [autoScroll]);

  return (
    <Card className="w-full overflow-hidden bg-slate-950 shadow-2xl">
      <div
        ref={containerRef}
        className="h-[400px] overflow-y-auto p-6 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700"
      >
        {linesToShow.map((line, lineIndex) => {
          if (line.text === "") {
            return (
              <motion.div
                key={lineIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: line.startDelay, duration: 0.1 }}
                className="h-4"
              />
            );
          }

          const characters = line.text.split("");

          return (
            <motion.div
              key={lineIndex}
              className="text-green-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: line.startDelay, duration: 0.1 }}
            >
              {characters.map((char, charIndex) => (
                <motion.span
                  key={charIndex}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: line.startDelay + charIndex * characterDelay,
                    duration: 0.05,
                    ease: "easeOut",
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
