import { Card } from "@/components/ui/card";
import { TypographyH3 } from "@/components/Typography";
import { cn } from "@/utils";

export function RuleSectionCard({
  icon: Icon,
  color,
  title,
  errors,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "green";
  title: string;
  errors?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg p-4">
      <div>
        <div className="flex items-center gap-3">
          <Icon
            className={cn("size-5", {
              "text-blue-600 dark:text-blue-400": color === "blue",
              "text-green-600 dark:text-green-400": color === "green",
            })}
          />
          <TypographyH3 className="text-base">{title}</TypographyH3>
        </div>

        {errors && <div className="mt-2">{errors}</div>}

        {children && <div className="mt-4 space-y-2">{children}</div>}
      </div>
    </Card>
  );
}
