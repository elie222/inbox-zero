import { cn } from "@/utils";

export function OnboardingWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center sm:px-6 sm:py-20 text-gray-900 bg-slate-50 min-h-screen",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        {children}
      </div>
    </div>
  );
}
