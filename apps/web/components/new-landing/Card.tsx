import { cva } from "class-variance-authority";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "extra-rounding";
  noPadding?: boolean;
  className?: string;
}

export function Card({
  children,
  variant = "default",
  noPadding = false,
  className,
}: CardProps) {
  const cardVariants = cva(
    "text-left flex flex-col border border-[#E7E7E780] rounded-[32px] bg-white shadow-[0px_3px_12.9px_0px_#97979714]",
    {
      variants: {
        variant: {
          "extra-rounding": "rounded-[32px]",
          default: "rounded-[20px]",
        },
        noPadding: {
          false: "p-8",
        },
      },
    },
  );
  return (
    <div className={cardVariants({ variant, noPadding, className })}>
      {children}
    </div>
  );
}
