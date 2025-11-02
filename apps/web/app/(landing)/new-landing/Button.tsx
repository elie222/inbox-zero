import { cva } from "class-variance-authority";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}

export function Button({
  children,
  variant = "primary",
  className,
}: ButtonProps) {
  const buttonVariants = cva("py-2 px-4 rounded-xl text-sm font-medium", {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#2563EB] to-[#6595FF] text-white shadow-[0px_2px_10.1px_0px_#4B83FD4D]",
        secondary: "bg-white border border-gray-100 text-gray-800",
      },
    },
  });

  return (
    <button type="button" className={buttonVariants({ variant, className })}>
      {children}
    </button>
  );
}
