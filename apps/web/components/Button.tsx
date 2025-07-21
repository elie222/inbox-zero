import Link from "next/link";
import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ButtonLoader } from "@/components/Loading";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {
  link?: { href: string; target?: React.HTMLAttributeAnchorTarget };
}

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-center font-semibold transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-default disabled:opacity-70",
  {
    variants: {
      size: {
        xs: "px-2 py-1 text-xs",
        sm: "px-2 py-1 text-sm",
        md: "px-2.5 py-1.5 text-sm",
        lg: "px-3 py-2 text-sm",
        xl: "px-3.5 py-2.5 text-sm",
        "2xl": "px-6 py-3 text-base font-medium",
        circle: "",
      },
      roundedSize: {
        md: "rounded-md",
        xl: "rounded-xl",
        full: "rounded-full py-4 shadow-lg",
      },
      color: {
        primary: "bg-gray-900 text-white hover:bg-gray-700 focus:ring-gray-900",
        red: "bg-red-100 text-primary hover:bg-red-200 focus:ring-red-500",
        white:
          "border border-muted bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-200",
        blue: "bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-600",
        transparent: "",
      },
      full: {
        true: "w-full",
      },
      loading: {
        true: "",
      },
    },
    compoundVariants: [
      {
        color: ["primary", "red", "white", "blue"],
        class:
          "border px-4 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-offset-2",
      },
    ],
    defaultVariants: {
      size: "lg",
      roundedSize: "md",
      color: "primary",
    },
  },
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (props: ButtonProps, ref) => {
    const { color, size, roundedSize, full, loading, className, ...rest } =
      props;

    const Component: React.ElementType = props.link ? BasicLink : "button";

    return (
      <Component
        type="button"
        className={buttonVariants({
          color,
          size,
          roundedSize,
          full,
          loading,
          className,
        })}
        {...rest}
        disabled={loading || props.disabled}
        ref={ref}
      >
        {loading && <ButtonLoader />}
        {rest.children}
      </Component>
    );
  },
);
Button.displayName = "Button";

const BasicLink = (props: {
  link: {
    href: string;
    target?: React.HTMLAttributeAnchorTarget;
    rel?: string | undefined;
  };
  children: React.ReactNode;
  type?: string;
}) => {
  const {
    link: { href, target, rel },
    type: _type, // must not be passed to the a tag or the styling doesn't work well on iOS
    children,
    ...rest
  } = props;

  return (
    // @ts-ignore
    <Link href={href} target={target} rel={rel} {...rest}>
      {children}
    </Link>
  );
};
