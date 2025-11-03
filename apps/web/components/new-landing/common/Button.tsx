import { cva, cx } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  size?: "md" | "lg";
  icon?: React.ReactNode;
  auto?: boolean;
}

export function Button({
  auto = false,
  children,
  variant = "primary",
  className,
  size = "md",
  icon,
}: ButtonProps) {
  const hasIcon = !!icon;
  const buttonVariants = cva("rounded-xl text-sm font-geist font-medium", {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#2965EC] to-[#6393FE] text-white shadow-[0px_2px_10.1px_0px_#4B83FD4D] button-gradient-border",
        secondary: "bg-white border border-gray-100 text-gray-800",
        "secondary-two":
          "bg-white border border-gray-100 text-gray-500 shadow-[0px_2px_16px_0px_#00000008]",
      },
      size: {
        md: "py-2 px-4",
        lg: "py-[11px] px-[18px]",
      },
      hasIcon: {
        true: "flex items-center justify-center gap-2",
      },
      auto: {
        true: "w-full",
      },
    },
  });

  if (variant === "primary") {
    return (
      <div
        className={cx(
          "rounded-[13px] p-[1px] bg-gradient-to-b from-[#2965EC] to-[#578AFA]",
          auto ? "w-full" : "w-fit",
        )}
      >
        <button
          type="button"
          className={buttonVariants({
            variant,
            size,
            className,
            hasIcon,
            auto,
          })}
        >
          {children}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={buttonVariants({ variant, size, className, hasIcon, auto })}
    >
      {icon ?? ""}
      {children}
    </button>
  );
}
