import { cva } from "class-variance-authority";

interface CardWrapperProps {
  children: React.ReactNode;
  padding?: "none" | "xs" | "sm" | "md";
  rounded?: "none" | "xs" | "sm" | "md";
  variant?: "default" | "dark-border";
  className?: string;
}

export function CardWrapper({
  children,
  variant = "default",
  className,
  padding = "md",
  rounded = "md",
}: CardWrapperProps) {
  const cardWrapperStyles = cva(
    "text-left border bg-gradient-to-b from-[#FFFFFF] to-[#F9F9F9]",
    {
      variants: {
        padding: {
          none: "",
          xs: "p-1.5",
          sm: "p-3",
          md: "p-5",
        },
        rounded: {
          none: "",
          xs: "rounded-[19px]",
          sm: "rounded-[38px]",
          md: "rounded-[52px]",
        },
        variant: {
          default: "border-[#F7F7F7]",
          "dark-border": "border-[#F2F2F2]",
        },
      },
    },
  );

  return (
    <div
      className={cardWrapperStyles({ padding, rounded, variant, className })}
    >
      {children}
    </div>
  );
}
