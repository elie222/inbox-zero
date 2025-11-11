import { Card } from "@/components/new-landing/common/Card";
import { cx } from "class-variance-authority";

interface DisplayCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  centerContent?: boolean;
  className?: string;
}

export function DisplayCard({
  title,
  description,
  icon,
  children,
  centerContent = false,
  className,
}: DisplayCardProps) {
  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      className={cx("overflow-hidden", className)}
      variant="extra-rounding"
    >
      <div
        className={cx(
          "border-t border-[#F6F6F6] bg-[#FCFCFC] flex h-full min-h-40",
          centerContent ? "items-center justify-center" : "items-end",
        )}
      >
        {children}
      </div>
    </Card>
  );
}
