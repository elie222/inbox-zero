export function InboxZeroCelebration({ splitName }: { splitName?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-4">
      <SunriseScene />
      <div className="flex flex-col items-center gap-1.5">
        <h2 className="font-title text-2xl text-foreground tracking-tight">
          {splitName ? "All clear" : "Inbox zero"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {splitName
            ? `Nothing left in ${splitName}.`
            : "You're all caught up. Enjoy the quiet."}
        </p>
      </div>
    </div>
  );
}

function SunriseScene() {
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
          <circle cx="180" cy="112" fill="url(#iz-glow)" r="70" />
          <circle cx="180" cy="112" fill="url(#iz-sun)" r="30" />

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
        {REFLECTIONS.map((line) => (
          <rect
            key={line.y}
            fill="#fdba74"
            height="2.5"
            opacity="0.7"
            rx="1.25"
            width={line.width}
            x={180 - line.width / 2}
            y={line.y}
          />
        ))}

        {BIRDS.map((bird) => (
          <path
            key={bird.x}
            d={`M${bird.x} ${bird.y} q4 -4 8 0 q4 -4 8 0`}
            fill="none"
            className="stroke-indigo-500 dark:stroke-indigo-200"
            strokeLinecap="round"
            strokeOpacity="0.55"
            strokeWidth="1.5"
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
  { x: 228, y: 52 },
  { x: 250, y: 42 },
  { x: 118, y: 64 },
];
