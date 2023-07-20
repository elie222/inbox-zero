import clsx from "clsx";
import Link from "next/link";
import React from "react";
import { LoadingMiniSpinner } from "./Loading";

interface ButtonProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  children: React.ReactNode;
  link?: { href: string; target?: React.HTMLAttributeAnchorTarget };
  full?: boolean;
  color?: Color;
  size?: Size;
  roundedSize?: "md" | "xl" | "full";
  loading?: boolean;
}

type Color = "primary" | "white" | "red" | "transparent" | "ghost";
type Size = "xs" | "sm" | "md" | "xl" | "circle";

export const Button = (props: ButtonProps) => {
  const {
    color = "primary",
    size = "md",
    roundedSize = "md",
    full,
    loading,
    ...rest
  } = props;

  const Component: React.ElementType = props.link ? BasicLink : "button";

  return (
    <Component
      type="button"
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap text-center text-sm font-medium",
        "disabled:cursor-default disabled:opacity-70",
        "transition-transform hover:scale-105",
        {
          xs: "px-2 py-1",
          sm: "px-3 py-2.5",
          md: "px-4 py-2.5",
          xl: "px-6 py-3 text-base font-medium",
          circle: "",
        }[size],
        {
          md: "rounded-md",
          xl: "rounded-xl",
          full: "rounded-full py-4 shadow-lg",
        }[roundedSize],
        {
          "border px-4 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2":
            color !== "transparent",
          "border-transparent": color !== "ghost" && color !== "white",

          "w-full": full,

          "bg-gray-900 text-white hover:bg-gray-700": color === "primary",
          "bg-red-100 text-gray-900 hover:bg-red-200": color === "red",
          "border border-gray-100 bg-white text-gray-700 hover:bg-gray-50":
            color === "white",
          "border border-blue-600 bg-white text-blue-600 hover:border-x-0 hover:bg-gradient-to-r hover:from-sky-500 hover:to-blue-600 hover:text-white":
            color === "ghost",
        }
      )}
      {...rest}
    >
      {loading && <LoadingMiniSpinner />}
      {rest.children}
    </Component>
  );
};

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
    type, // must not be passed to the a tag or the styling doesn't work well on iOS
    children,
    ...rest
  } = props;

  return (
    <Link href={href} target={target} rel={rel} {...rest}>
      {children}
    </Link>
  );
};
