import { cva, cx } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  size?: "md" | "lg" | "xl";
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
  const buttonVariants = cva("rounded-[13px] font-geist font-medium", {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#2965EC] to-[#6393FE] text-white shadow-[0px_2px_10.1px_0px_#4B83FD4D] button-gradient-border",
        secondary: "bg-white border border-gray-100 text-gray-800",
        "secondary-two":
          "bg-white border border-gray-100 text-gray-500 shadow-[0px_2px_16px_0px_#00000008]",
      },
      size: {
        md: "text-sm py-2 px-4",
        lg: "text-sm py-[10.5px] px-[18px]",
        xl: "text-[15px] py-[11.7px] px-[20px]",
      },
      hasIcon: {
        true: "flex items-center justify-center gap-2",
      },
      auto: {
        true: "w-full",
      },
    },
  });

  const buttonIconVariants = cva("", {
    variants: {
      variant: {
        primary: "",
        secondary: "",
        "secondary-two": "text-[#AEAAA8]",
      },
    },
  });

  if (variant === "primary") {
    return (
      <div
        className={cx(
          "rounded-[14px] p-[1px] bg-gradient-to-b from-[#5989F0] to-[#578AFA]",
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
      {icon ? (
        <div className={buttonIconVariants({ variant })}>{icon}</div>
      ) : null}
      {children}
    </button>
  );
}
