import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/utils";

interface SettingCardProps {
  title: string;
  description: string;
  right?: React.ReactNode;
  collapseOnMobile?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "compact" | "full";
}

export function SettingCard({
  title,
  description,
  right,
  collapseOnMobile = false,
  children,
  footer,
  action,
  className,
  variant = "default",
}: SettingCardProps) {
  // Compact variant: original layout with right slot
  if (variant === "compact" || right) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div
            className={
              collapseOnMobile
                ? "flex flex-col gap-4 md:flex-row md:items-center"
                : "flex items-center gap-4"
            }
          >
            <div className="flex-1">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {right}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full variant: new layout with header, content, footer, action
  return (
    <Card
      className={cn(
        "w-full border-none bg-card px-0 shadow-none dark:bg-card",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between px-0 pt-0">
        <div>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription className="mt-1">{description}</CardDescription>
          )}
        </div>
        {action && <div>{action}</div>}
      </CardHeader>
      <CardContent className="space-y-6 px-0">{children}</CardContent>
      {footer && (
        <div className="border-t border-border py-4 mt-4">{footer}</div>
      )}
    </Card>
  );
}
