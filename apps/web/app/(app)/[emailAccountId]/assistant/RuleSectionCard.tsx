import { Card } from "@/components/ui/card";
import { TypographyH3 } from "@/components/Typography";
import { cn } from "@/utils";

function SectionHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          iconBg,
        )}
      >
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="flex-1">
        <TypographyH3 className="text-base font-semibold">{title}</TypographyH3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function RuleSectionCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  headerActions,
  errors,
  children,
  footerActions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  headerActions?: React.ReactNode;
  errors?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg p-4">
      <div>
        <SectionHeader
          icon={Icon}
          iconBg={iconBg}
          iconColor={iconColor}
          title={title}
          description={description}
        />

        {headerActions && (
          <div className="mt-4 flex items-center justify-end gap-1.5">
            {headerActions}
          </div>
        )}

        {errors && <div className="mt-2">{errors}</div>}

        <div className="mt-4 space-y-4">{children}</div>

        {footerActions && <div className="mt-4">{footerActions}</div>}
      </div>
    </Card>
  );
}
