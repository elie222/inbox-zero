"use client";

import { motion, useReducedMotion } from "framer-motion";

export function InboxZeroCelebration({ splitName }: { splitName?: string }) {
  const reduceMotion = useReducedMotion();
  const rise = (delay: number) =>
    reduceMotion
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] },
        };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-4">
      <SunriseScene reduceMotion={!!reduceMotion} />
      <div className="flex flex-col items-center gap-1.5">
        <motion.h2
          className="font-title text-2xl text-foreground tracking-tight"
          {...rise(0.9)}
        >
          {splitName ? "All clear" : "Inbox zero"}
        </motion.h2>
        <motion.p className="text-muted-foreground text-sm" {...rise(1.1)}>
          {splitName
            ? `Nothing left in ${splitName}.`
            : "You're all caught up. Enjoy the quiet."}
        </motion.p>
      </div>
    </div>
  );
}

function SunriseScene({ reduceMotion }: { reduceMotion: boolean }) {
  const sunY = 112;

  return (
    <svg
      aria-hidden="true"
      className="w-full max-w-[360px]"
      role="presentation"
      viewBox="0 0 360 200"
    >
      <defs>
        <linearGradient id="iz-sky" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            className="[stop-color:#c7d2fe] dark:[stop-color:#1e1b4b]"
          />
          <stop
            offset="55%"
            className="[stop-color:#fbcfe8] dark:[stop-color:#6b21a8]"
          />
          <stop
            offset="100%"
            className="[stop-color:#fed7aa] dark:[stop-color:#f472b6]"
          />
        </linearGradient>
        <radialGradient id="iz-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff7ed" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff7ed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="iz-sun" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id="iz-water" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            className="[stop-color:#fbe0ec] dark:[stop-color:#9d4b8a]"
          />
          <stop
            offset="100%"
            className="[stop-color:#a5b4fc] dark:[stop-color:#1e1b4b]"
          />
        </linearGradient>
        <radialGradient id="iz-fade" cx="0.5" cy="0.5" r="0.5">
          <stop offset="45%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="iz-mask">
          <rect fill="url(#iz-fade)" height="200" width="360" />
        </mask>
        <clipPath id="iz-above-water">
          <rect height="140" width="360" />
        </clipPath>
      </defs>

      <g mask="url(#iz-mask)">
        <rect fill="url(#iz-sky)" height="200" width="360" />

        <g clipPath="url(#iz-above-water)">
          <motion.g
            initial={reduceMotion ? false : { y: 46 }}
            animate={{ y: 0 }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.circle
              cx="180"
              cy={sunY}
              fill="url(#iz-glow)"
              r="70"
              animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
              transition={{
                duration: 5,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
              style={{ transformOrigin: `180px ${sunY}px` }}
            />
            <circle cx="180" cy={sunY} fill="url(#iz-sun)" r="30" />
          </motion.g>

          <path
            d="M0 118 C40 96 78 92 116 108 C150 122 176 104 214 98 C258 90 300 104 360 96 L360 140 L0 140 Z"
            className="fill-[#f4b4cf] dark:fill-[#a3487f]"
          />
          <path
            d="M0 128 C52 112 92 118 132 126 C176 134 214 116 262 116 C304 116 332 126 360 122 L360 140 L0 140 Z"
            className="fill-[#e48aab] dark:fill-[#6d2a63]"
          />
        </g>

        <rect fill="url(#iz-water)" height="60" width="360" y="140" />
        {REFLECTIONS.map((line, index) => (
          <motion.rect
            key={line.y}
            fill="#fdba74"
            height="2.5"
            rx="1.25"
            width={line.width}
            x={180 - line.width / 2}
            y={line.y}
            initial={reduceMotion ? false : { opacity: 0, scaleX: 0.4 }}
            animate={
              reduceMotion
                ? { opacity: 0.7 }
                : { opacity: [0.35, 0.8, 0.35], scaleX: [0.85, 1, 0.85] }
            }
            transition={{
              delay: 1 + index * 0.15,
              duration: 3.2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: `180px ${line.y}px` }}
          />
        ))}

        {BIRDS.map((bird) => (
          <motion.path
            key={bird.x}
            d={`M${bird.x} ${bird.y} q4 -4 8 0 q4 -4 8 0`}
            fill="none"
            className="stroke-indigo-500 dark:stroke-indigo-200"
            strokeLinecap="round"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            initial={reduceMotion ? false : { opacity: 0, x: -12 }}
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, x: [0, 10, 0] }
            }
            transition={{
              opacity: { delay: bird.delay, duration: 0.8 },
              x: {
                delay: bird.delay,
                duration: 9,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              },
            }}
          />
        ))}
      </g>
    </svg>
  );
}

const REFLECTIONS = [
  { y: 148, width: 64 },
  { y: 158, width: 44 },
  { y: 168, width: 28 },
  { y: 178, width: 14 },
];

const BIRDS = [
  { x: 228, y: 52, delay: 1.2 },
  { x: 250, y: 42, delay: 1.4 },
  { x: 118, y: 64, delay: 1.6 },
];
