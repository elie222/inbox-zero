import { cva } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}

export function Button({
  children,
  variant = "primary",
  className,
}: ButtonProps) {
  const buttonVariants = cva(
    "py-2 px-4 rounded-xl text-sm font-medium hover:scale-[102%] transition-all duration-200 will-change-transform",
    {
      variants: {
        variant: {
          primary:
            "bg-gradient-to-b from-[#2563EB] to-[#6595FF] text-white shadow-[0px_2px_10.1px_0px_#4B83FD4D]",
          secondary: "bg-white border border-gray-100 text-gray-800",
          "secondary-two":
            "bg-white border border-gray-100 text-gray-500 shadow-[0px_2px_16px_0px_#00000008]",
        },
      },
    },
  );

  return (
    <button type="button" className={buttonVariants({ variant, className })}>
      {children}
    </button>
  );
}
