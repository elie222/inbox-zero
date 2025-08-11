import { cn } from "@/utils";

type IconCircleSize = "sm" | "md" | "lg";

interface IconCircleProps {
  children: React.ReactNode;
  size?: IconCircleSize;
  className?: string;
}

const sizeConfig = {
  sm: {
    outer: "h-8 w-8 min-w-8",
    inner: "h-6 w-6",
    text: "text-xs",
  },
  md: {
    outer: "h-12 w-12 min-w-12",
    inner: "h-8 w-8",
    text: "text-sm",
  },
  lg: {
    outer: "h-16 w-16 min-w-16",
    inner: "h-12 w-12",
    text: "text-base",
  },
};

export function IconCircle({
  children,
  size = "md",
  className,
}: IconCircleProps) {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        config.outer,
        className,
      )}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-blue-600/40 to-blue-600/5 shadow-sm" />
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full bg-white shadow-sm",
          config.inner,
        )}
      >
        <span className={cn("font-semibold text-blue-600", config.text)}>
          {children}
        </span>
      </div>
    </div>
  );
}
