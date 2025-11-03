import { cva } from "class-variance-authority";

interface CardWrapperProps {
  children: React.ReactNode;
  padding?: string;
  rounded?: string;
  size?: "xs" | "sm" | "md";
  variant?: "default" | "dark-border";
}

export function CardWrapper({
  children,
  size = "md",
  variant = "default",
}: CardWrapperProps) {
  const cardWrapperStyles = cva(
    "text-left border bg-gradient-to-b from-[#FFFFFF] to-[#F9F9F9]",
    {
      variants: {
        size: {
          xs: "p-1.5 rounded-[19px]",
          sm: "p-3 rounded-[38px]",
          md: "p-5 rounded-[52px]",
        },
        variant: {
          default: "border-[#F7F7F7]",
          "dark-border": "border-[#F2F2F2]",
        },
      },
    },
  );

  return <div className={cardWrapperStyles({ size, variant })}>{children}</div>;
}
