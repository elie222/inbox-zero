import { cva } from "class-variance-authority";

interface CardWrapperProps {
  children: React.ReactNode;
  padding?: string;
  rounded?: string;
  size?: "sm" | "md";
}

export function CardWrapper({ children, size = "md" }: CardWrapperProps) {
  const cardWrapperStyles = cva(
    "text-left border border-[#F7F7F7] bg-gradient-to-b from-[#FFFFFF] to-[#F9F9F9]",
    {
      variants: {
        size: {
          sm: "p-3 rounded-[38px]",
          md: "p-5 rounded-[52px]",
        },
      },
    },
  );

  return <div className={cardWrapperStyles({ size })}>{children}</div>;
}
