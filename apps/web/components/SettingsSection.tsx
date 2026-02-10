import type React from "react";
import { cn } from "@/utils";

export function SettingsSection({
  title,
  description,
  actions,
  children,
  align = "center",
  className,
  id,
  titleClassName,
  descriptionClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
  id?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  const hasHeader = title || description || actions;

  return (
    <section className={cn("space-y-3", className)} id={id}>
      {hasHeader ? (
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:justify-between",
            align === "start" ? "sm:items-start" : "sm:items-center",
          )}
        >
          {title || description ? (
            <div className="space-y-0.5">
              {title ? (
                <h3 className={cn("font-medium", titleClassName)}>{title}</h3>
              ) : null}
              {description ? (
                <p
                  className={cn(
                    "text-sm text-muted-foreground",
                    descriptionClassName,
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ?? null}
        </div>
      ) : null}
      {children ?? null}
    </section>
  );
}
