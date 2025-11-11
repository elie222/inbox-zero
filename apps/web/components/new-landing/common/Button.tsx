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
  const buttonVariants = cva(
    [
      "rounded-[13px] font-geist font-medium transition-all will-change-transform",
      variant === "primary" ? "" : "hover:scale-[1.04]",
    ],
    {
      variants: {
        variant: {
          primary: [
            "bg-gradient-to-b from-[#2965EC] to-[#5C89F8] text-white button-gradient-border shadow-[0px_2px_10.1px_0px_#4B83FD33] hover:shadow-[0px_2px_10.1px_0px_#4B83FD44]",
            "relative overflow-hidden z-10",
            "before:absolute before:inset-0 before:bg-gradient-to-b before:from-[#285EE5] before:to-[#5380F2] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-200 before:z-0",
          ],
          secondary:
            "bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 text-gray-800",
          "secondary-two":
            "bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 text-gray-500 shadow-[0px_2px_16px_0px_#00000008] hover:shadow-[0px_2px_16px_0px_#00000015]",
        },
        size: {
          md: "text-sm py-2 px-4",
          lg: "text-sm py-[10.5px] px-[18px]",
          xl: "text-[16px] py-[11.7px] px-[22px]",
        },
        hasIcon: {
          true: "flex items-center justify-center gap-2",
        },
        auto: {
          true: "w-full",
        },
      },
    },
  );

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
          "hover:scale-[1.04] transition-all duration-200 will-change-transform",
          "rounded-[14px] p-[1px] bg-gradient-to-b",
          "from-[#5989F0] to-[#578AFA] hover:from-[#4875d0] hover:to-[#396ecc]",
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
          <span className="relative z-10">{children}</span>
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
