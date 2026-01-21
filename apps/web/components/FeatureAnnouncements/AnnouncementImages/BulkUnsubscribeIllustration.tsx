import { Check, X } from "lucide-react";

export function BulkUnsubscribeIllustration() {
  const newsletters = [
    { name: "Daily Digest", icon: "📰", checked: true },
    { name: "Tech Weekly", icon: "💻", checked: true },
    { name: "Marketing Pro", icon: "📈", checked: false },
  ];

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30">
      <div className="absolute inset-0 flex flex-col justify-center px-8 py-8">
        {/* Newsletter list */}
        <div className="flex flex-col gap-1.5">
          {newsletters.map((newsletter, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-2 dark:bg-slate-800/90 ${
                newsletter.checked ? "opacity-60" : ""
              }`}
            >
              {/* Checkbox */}
              <div
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  newsletter.checked
                    ? "border-red-400 bg-red-400"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                {newsletter.checked && (
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                )}
              </div>

              {/* Newsletter info */}
              <span className="text-sm">{newsletter.icon}</span>
              <span
                className={`text-[10px] font-medium ${
                  newsletter.checked
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {newsletter.name}
              </span>

              {newsletter.checked && (
                <X className="ml-auto h-3 w-3 text-red-400" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
