import { Card } from "@/components/new-landing/common/Card";
import { cx } from "class-variance-authority";

interface DisplayCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  centerContent?: boolean;
}

export function DisplayCard({
  title,
  description,
  icon,
  children,
  centerContent = false,
}: DisplayCardProps) {
  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      className="overflow-hidden"
    >
      <div
        className={cx(
          "border-t border-[#F6F6F6] bg-[#FCFCFC]",
          "flex h-full",
          centerContent ? "items-center justify-center" : "items-end",
        )}
      >
        {children}
      </div>
    </Card>
  );
}
