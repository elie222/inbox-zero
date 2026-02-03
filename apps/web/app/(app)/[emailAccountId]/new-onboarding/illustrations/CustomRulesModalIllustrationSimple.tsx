"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, Forward, MousePointer2, PlusCircle } from "lucide-react";

const ruleText =
  "Label urgent emails as urgent and forward receipts to jane@accounting.com";

const createdRules = [
  {
    name: "Label urgent emails",
    icon: Tag,
    color: "bg-blue-50 text-blue-700 ring-blue-600/10",
  },
  {
    name: "Forward receipts",
    icon: Forward,
    color: "bg-green-50 text-green-700 ring-green-600/10",
  },
];

type AnimationPhase =
  | "idle"
  | "show-text"
  | "moving-to-button"
  | "clicking"
  | "loading"
  | "showing-rules"
  | "pause";

export function CustomRulesModalIllustrationSimple() {
  const [phase, setPhase] = useState<AnimationPhase>("idle");
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    setPhase("idle");

    const timeouts: NodeJS.Timeout[] = [];
    let time = 600;

    timeouts.push(setTimeout(() => setPhase("show-text"), time));

    time += 1000;
    timeouts.push(setTimeout(() => setPhase("moving-to-button"), time));

    time += 500;
    timeouts.push(setTimeout(() => setPhase("clicking"), time));

    time += 200;
    timeouts.push(setTimeout(() => setPhase("loading"), time));

    time += 1200;
    timeouts.push(setTimeout(() => setPhase("showing-rules"), time));

    time += 2500;
    timeouts.push(setTimeout(() => setPhase("pause"), time));

    time += 800;
    timeouts.push(setTimeout(() => setAnimationKey((prev) => prev + 1), time));

    return () => timeouts.forEach(clearTimeout);
  }, [animationKey]);

  const getCursorPosition = () => {
    switch (phase) {
      case "idle":
      case "show-text":
        return { x: 100, y: -60, opacity: 0 };
      case "moving-to-button":
        return { x: -90, y: 128, opacity: 1 };
      case "clicking":
        return { x: -90, y: 131, opacity: 1 };
      case "loading":
      case "showing-rules":
      case "pause":
        return { x: -90, y: 128, opacity: 0 };
      default:
        return { x: 100, y: -60, opacity: 0 };
    }
  };

  const cursorPos = getCursorPosition();
  const isLoading = phase === "loading";
  const showText =
    phase !== "idle" && phase !== "showing-rules" && phase !== "pause";
  const showRules = phase === "showing-rules" || phase === "pause";

  return (
    <div className="relative flex h-[280px] w-[320px] items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-3 w-[320px] shrink-0"
      >
        <div className="rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2 text-left">
              Add new rules
            </div>

            <div className="relative rounded border border-gray-200 bg-gray-50 p-2.5 min-h-[70px]">
              <AnimatePresence mode="wait">
                {showText ? (
                  <motion.div
                    key="text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="text-[11px] text-gray-700 text-left leading-relaxed"
                  >
                    {ruleText}
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    className="text-[11px] text-gray-400 text-left leading-relaxed"
                  >
                    Describe your rules...
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-2 mt-3">
              <motion.button
                animate={{
                  scale: phase === "clicking" ? 0.95 : 1,
                }}
                transition={{ duration: 0.1 }}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white"
              >
                {isLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "linear",
                      }}
                      className="size-3 border border-white border-t-transparent rounded-full"
                    />
                    <span>Creating...</span>
                  </>
                ) : (
                  "Create rules"
                )}
              </motion.button>
            </div>
          </div>
        </div>

        <div className="relative h-[72px]">
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-gray-300 bg-transparent p-3 flex flex-col items-center justify-center gap-1">
            <PlusCircle className="size-4 text-gray-400" />
            <span className="text-[11px] text-gray-400">No rules yet</span>
          </div>

          <AnimatePresence>
            {showRules && (
              <motion.div
                key="rules-created"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 rounded-lg border border-gray-200 bg-white shadow-lg p-3"
              >
                <div className="text-xs font-semibold text-gray-700 mb-2 text-left">
                  Handle Urgent Emails
                </div>
                <div className="flex flex-wrap gap-2">
                  {createdRules.map((rule, index) => {
                    const Icon = rule.icon;
                    return (
                      <motion.div
                        key={rule.name}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.15, duration: 0.25 }}
                        className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${rule.color}`}
                      >
                        <Icon className="size-3" />
                        <span>{rule.name}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: cursorPos.opacity,
          x: cursorPos.x,
          y: cursorPos.y,
        }}
        transition={{
          duration: 0.4,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="absolute z-30 pointer-events-none"
      >
        <MousePointer2 className="h-4 w-4 text-gray-800 fill-white drop-shadow-md" />
      </motion.div>
    </div>
  );
}
