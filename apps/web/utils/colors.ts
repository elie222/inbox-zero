const colors = [
  "#ef4444", // Red 500
  "#f97316", // Orange 500
  "#f59e0b", // Amber 500
  "#eab308", // Yellow 500
  "#84cc16", // Lime 500
  "#22c55e", // Green 500
  "#10b981", // Emerald 500
  "#14b8a6", // Teal 500
  "#06b6d4", // Cyan 500
  "#0ea5e9", // Sky 500
  "#3b82f6", // Blue 500
  "#6366f1", // Indigo 500
  "#8b5cf6", // Violet 500
  "#a855f7", // Purple 500
  "#d946ef", // Fuchsia 500
  "#ec4899", // Pink 500
  "#f43f5e", // Rose 500
];

export function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

export const COLORS = {
  analytics: {
    blue: "#006EFF80",
    purple: "#6410FF80",
    pink: "#C942B2",
    lightPink: "#C942B260",
    green: "#17A34A",
    lightGreen: "#17A34A60",
  },
  footer: {
    gray: "#4E4E4E",
  },
};
