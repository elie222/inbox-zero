import { Paragraph } from "@/components/new-landing/common/Typography";
import { cva, cx } from "class-variance-authority";

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cx("p-6", className)}>{children}</div>;
}

interface CardHeaderProps {
  title?: string;
  icon?: React.ReactNode;
  addon?: React.ReactNode;
  description?: string;
}

export function CardHeader({
  title,
  icon,
  addon,
  description,
}: CardHeaderProps) {
  return (
    <CardContent>
      {title || addon ? (
        <div className="flex items-center justify-between">
          {icon}
          {addon}
        </div>
      ) : null}
      {title ? (
        <h2
          className={cx(
            "font-aeonik text-xl leading-6",
            title || addon ? "mt-5" : "",
          )}
        >
          {title}
        </h2>
      ) : null}
      {description ? (
        <Paragraph size="sm" className="mt-3">
          {description}
        </Paragraph>
      ) : null}
    </CardContent>
  );
}

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "extra-rounding" | "circle";
  className?: string;
  icon?: React.ReactNode;
  addon?: React.ReactNode;
  title?: string;
  description?: string;
}

export function Card({
  children,
  variant = "default",
  className,
  icon,
  addon,
  title,
  description,
}: CardProps) {
  const cardVariants = cva(
    [
      "text-left flex flex-col border border-[#E7E7E780] bg-white shadow-[0px_3px_12.9px_0px_#97979714]",
    ],
    {
      variants: {
        variant: {
          circle: "rounded-full",
          "extra-rounding": "rounded-[32px]",
          default: "rounded-[20px]",
        },
      },
    },
  );
  return (
    <div className={cardVariants({ variant, className })}>
      {title || icon || addon ? (
        <CardHeader
          title={title}
          icon={icon}
          addon={addon}
          description={description}
        />
      ) : null}
      {children}
    </div>
  );
}
