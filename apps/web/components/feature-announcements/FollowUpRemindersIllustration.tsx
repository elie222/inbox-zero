export function FollowUpRemindersIllustration() {
  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="absolute inset-0 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[280px] rounded-lg bg-white p-3 shadow-md dark:bg-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-semibold text-pink-600 dark:bg-pink-900/50 dark:text-pink-300">
              SM
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  Sarah Miller
                </span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-800/50 dark:text-amber-300">
                  Follow up
                </span>
              </div>
              <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                Meeting follow-up
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
            Thanks for your time today. I wanted to follow up on...
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-gray-700">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              ↩ You replied · 3 days ago
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
