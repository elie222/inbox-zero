import { Shield, Ban } from "lucide-react";

export function ColdEmailBlockerIllustration() {
  const blockedEmails = [
    { from: "sales@company.io", subject: "Quick question about..." },
    { from: "outreach@startup.co", subject: "Partnership opportunity" },
    { from: "growth@agency.com", subject: "Increase your revenue..." },
  ];

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
      <div className="absolute inset-0 flex items-center justify-center px-6 py-6">
        {/* Blocked emails */}
        <div className="relative flex flex-col gap-1.5">
          {blockedEmails.map((email, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 opacity-50 dark:bg-slate-800/70"
              style={{
                transform: `translateX(${index * 3}px)`,
              }}
            >
              <div className="h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[9px] text-gray-400 line-through">
                  {email.from}
                </div>
                <div className="truncate text-[10px] text-gray-400 line-through">
                  {email.subject}
                </div>
              </div>
              <Ban className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
            </div>
          ))}

          {/* Blocked overlay */}
          <div className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-semibold text-white shadow-lg">
            <Ban className="h-3 w-3" />
            Blocked
          </div>
        </div>

        {/* Shield */}
        <div className="ml-4 flex flex-col items-center">
          <div className="relative">
            <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow">
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <span className="mt-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
            Protected
          </span>
        </div>
      </div>
    </div>
  );
}
