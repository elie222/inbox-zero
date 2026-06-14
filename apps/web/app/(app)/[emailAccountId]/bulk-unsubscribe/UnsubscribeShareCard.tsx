import { forwardRef } from "react";
import { MailOpenIcon, SparklesIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BRAND_NAME } from "@/utils/branding";
import { cn } from "@/utils";

export const UnsubscribeShareCard = forwardRef<
  HTMLDivElement,
  {
    senderCount: number;
    emailCount: number;
    className?: string;
  }
>(function UnsubscribeShareCard({ senderCount, emailCount, className }, ref) {
  const lists = senderCount === 1 ? "email list" : "email lists";

  return (
    <div
      ref={ref}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-7 py-8 text-white shadow-lg",
        className,
      )}
    >
      {/* Decorative glow + sparkles to make the card feel celebratory */}
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-sky-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 size-52 rounded-full bg-indigo-400/25 blur-3xl" />
      <SparklesIcon className="pointer-events-none absolute right-7 top-7 size-6 text-white/50" />
      <SparklesIcon className="pointer-events-none absolute right-16 top-16 size-3.5 text-white/30" />

      <Logo className="relative h-5 w-auto text-white" />

      <div className="relative mt-7">
        <div className="bg-gradient-to-b from-white to-sky-100 bg-clip-text text-7xl font-bold leading-none tracking-tight text-transparent tabular-nums sm:text-8xl">
          {senderCount.toLocaleString("en-US")}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {lists} silenced
        </div>
      </div>

      {emailCount > 0 && (
        <div className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm">
          <MailOpenIcon className="size-4" />
          {emailCount.toLocaleString("en-US")} fewer{" "}
          {emailCount === 1 ? "email" : "emails"} in my inbox
        </div>
      )}

      <div className="relative mt-7 text-sm font-medium text-white/70">
        Cleaned up with {BRAND_NAME}
      </div>
    </div>
  );
});
