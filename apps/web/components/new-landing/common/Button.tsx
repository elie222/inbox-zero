import { Slot } from "@radix-ui/react-slot";
import { cva, cx } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "secondary-two";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  size?: "md" | "lg" | "xl";
  auto?: boolean;
  asChild?: boolean;
}

export function Button({
  auto = false,
  children,
  variant = "primary",
  className,
  size = "md",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const type = props.type ?? "button";

  const buttonVariants = cva(
    [
      "rounded-[13px] font-geist font-medium transition-all will-change-transform",
      "flex items-center justify-center gap-2",
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
            "bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 text-gray-500 shadow-[0px_2px_16px_0px_#00000008] hover:shadow-[0px_2px_16px_0px_#00000015] [&>svg]:text-[#AEAAA8]",
        },
        size: {
          md: "text-sm py-2 px-4",
          lg: "text-sm py-[10.5px] px-[18px]",
          xl: "text-[16px] py-[11.7px] px-[22px]",
        },
        auto: {
          true: "w-full",
        },
      },
    },
  );

  // For primary variant with gradient border wrapper
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
        <Comp
          type={type}
          className={buttonVariants({
            variant,
            size,
            className,
            auto,
          })}
          {...props}
        >
          {asChild ? (
            children
          ) : (
            <span className="relative z-10">{children}</span>
          )}
        </Comp>
      </div>
    );
  }

  // For secondary variants - simpler, no wrapper
  return (
    <Comp
      type={type}
      className={buttonVariants({ variant, size, className, auto })}
      {...props}
    >
      {children}
    </Comp>
  );
}
