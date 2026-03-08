import { Card } from "@/components/new-landing/common/Card";
import { cn } from "@/utils";

interface DisplayCardProps {
  cardHeaderClassName?: string;
  centerContent?: boolean;
  children: React.ReactNode;
  className?: string;
  description: string;
  icon: React.ReactNode;
  title: string;
}

export function DisplayCard({
  title,
  description,
  icon,
  children,
  centerContent = false,
  className,
  cardHeaderClassName,
}: DisplayCardProps) {
  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      className={cn("overflow-hidden h-full", className)}
      variant="extra-rounding"
      cardHeaderClassName={cardHeaderClassName}
    >
      <div
        className={cn(
          "border-t border-[#F6F6F6] bg-[#FCFCFC] flex h-full min-h-40",
          centerContent ? "items-center justify-center" : "items-end",
        )}
      >
        {children}
      </div>
    </Card>
  );
}
