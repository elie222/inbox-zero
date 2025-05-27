import { cn } from "@/utils";

interface NoticeProps {
  children: React.ReactNode;
  variant?: "info" | "warning" | "success" | "error";
  className?: string;
}

const variantStyles = {
  info: "text-blue-600 bg-blue-50 border-blue-100",
  warning: "text-amber-600 bg-amber-50 border-amber-100",
  success: "text-green-600 bg-green-50 border-green-100",
  error: "text-red-600 bg-red-50 border-red-100",
};

export function Notice({ children, variant = "info", className }: NoticeProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
