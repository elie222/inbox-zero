import { Clock, Mail } from "lucide-react";

export function EmailAnalyticsIllustration() {
  const barHeights = [45, 70, 50, 85, 60];
  const days = ["M", "T", "W", "T", "F"];

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
      <div className="absolute inset-0 flex items-center justify-center gap-5 px-8 py-8">
        {/* Stats cards */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2.5 shadow-sm dark:bg-slate-800/90">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <Mail className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">
                Emails/day
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                47
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2.5 shadow-sm dark:bg-slate-800/90">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
              <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">
                Avg response
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                2.4h
              </div>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex flex-col items-center rounded-lg bg-white/90 p-3 shadow-sm dark:bg-slate-800/90">
          <div className="mb-1.5 text-[9px] font-medium text-gray-500 dark:text-gray-400">
            Weekly volume
          </div>
          <div className="flex items-end gap-1.5">
            {barHeights.map((height, index) => (
              <div key={index} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-5 rounded-sm bg-gradient-to-t from-emerald-500 to-teal-400"
                  style={{ height: `${height}px` }}
                />
                <span className="text-[8px] text-gray-400">{days[index]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
