export function InboxZeroCelebration({ splitName }: { splitName?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-4">
      <SunriseScene />
      <h2 className="font-title text-2xl text-foreground tracking-tight">
        {splitName ? "All clear" : "You've reached inbox zero"}
      </h2>
    </div>
  );
}

function SunriseScene() {
  return (
    <svg
      aria-hidden="true"
      className="w-full max-w-[260px]"
      role="presentation"
      viewBox="0 0 360 200"
    >
      <defs>
        <linearGradient id="iz-sky" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="55%"
            className="[stop-color:#eff6ff] dark:[stop-color:#262c38]"
          />
          <stop
            offset="100%"
            className="[stop-color:#dbeafe] dark:[stop-color:#2c3a52]"
          />
        </linearGradient>
        <linearGradient id="iz-sun" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            className="[stop-color:#bfdbfe] dark:[stop-color:#5b7aa8]"
          />
          <stop
            offset="100%"
            className="[stop-color:#93c5fd] dark:[stop-color:#4a6894]"
          />
        </linearGradient>
        <linearGradient id="iz-water" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            className="[stop-color:#dbeafe] dark:[stop-color:#2c3a52]"
          />
          <stop
            offset="100%"
            className="[stop-color:#eff6ff] dark:[stop-color:#262c38]"
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
          <circle cx="180" cy="112" fill="url(#iz-sun)" r="30" />

          <path
            d="M0 118 C40 96 78 92 116 108 C150 122 176 104 214 98 C258 90 300 104 360 96 L360 140 L0 140 Z"
            className="fill-blue-100 dark:fill-[#2f3d57]"
          />
          <path
            d="M0 128 C52 112 92 118 132 126 C176 134 214 116 262 116 C304 116 332 126 360 122 L360 140 L0 140 Z"
            className="fill-blue-200 dark:fill-[#364869]"
          />
        </g>

        <rect fill="url(#iz-water)" height="60" width="360" y="140" />
        {REFLECTIONS.map((line) => (
          <rect
            key={line.y}
            className="fill-blue-300 dark:fill-[#4a6894]"
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
            className="stroke-blue-400 dark:stroke-[#8ea6cc]"
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
