import { FolderIcon } from "lucide-react";

export function SmartCategoriesIllustration() {
  const categories = [
    { name: "Work", color: "#3b82f6", bgColor: "#dbeafe", count: 12 },
    { name: "Personal", color: "#8b5cf6", bgColor: "#ede9fe", count: 5 },
    { name: "Newsletters", color: "#06b6d4", bgColor: "#cffafe", count: 23 },
  ];

  const emails = [
    { from: "Team Slack", category: "Work" },
    { from: "Mom", category: "Personal" },
    { from: "Morning Brew", category: "Newsletters" },
  ];

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30">
      <div className="absolute inset-0 flex items-center justify-center gap-4 px-8 py-6">
        {/* Incoming emails */}
        <div className="flex flex-col gap-1.5">
          {emails.map((email, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1.5 shadow-sm dark:bg-slate-800/80"
            >
              <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-600" />
              <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                {email.from}
              </span>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1">
          <svg
            className="h-6 w-6 text-violet-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          <span className="text-[8px] font-medium text-violet-500 dark:text-violet-400">
            AI sorts
          </span>
        </div>

        {/* Categories */}
        <div className="flex flex-col gap-1.5">
          {categories.map((category, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 shadow-sm"
              style={{ backgroundColor: category.bgColor }}
            >
              <FolderIcon
                className="h-4 w-4"
                style={{ color: category.color }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: category.color }}
              >
                {category.name}
              </span>
              <span
                className="ml-auto rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                style={{
                  backgroundColor: category.color,
                  color: "white",
                }}
              >
                {category.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
