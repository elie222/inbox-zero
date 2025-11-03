import { cva } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  size?: "md" | "lg";
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  className,
  size = "md",
  icon,
}: ButtonProps) {
  const hasIcon = !!icon;
  const buttonVariants = cva(
    "font-geist font-medium hover:scale-[102%] transition-all duration-200 will-change-transform",
    {
      variants: {
        variant: {
          primary:
            "bg-gradient-to-b from-[#2563EB] to-[#6595FF] text-white shadow-[0px_2px_10.1px_0px_#4B83FD4D]",
          secondary: "bg-white border border-gray-100 text-gray-800",
          "secondary-two":
            "bg-white border border-gray-100 text-gray-500 shadow-[0px_2px_16px_0px_#00000008]",
        },
        size: {
          md: "py-2 px-4 rounded-xl text-sm",
          lg: "py-[11px] px-[18px] rounded-xl text-sm",
        },
        hasIcon: {
          true: "flex items-center gap-2",
        },
      },
    },
  );

  return (
    <button
      type="button"
      className={buttonVariants({ variant, size, className, hasIcon })}
    >
      {icon}
      {children}
    </button>
  );
}
