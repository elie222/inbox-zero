import { cva, cx } from "class-variance-authority";

interface HeadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Heading({ children, className }: HeadingProps) {
  return (
    <h1
      className={cx(
        "font-aeonik text-[#242424] text-4xl md:text-5xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

interface SubheadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Subheading({ children, className }: SubheadingProps) {
  return (
    <h2
      className={cx(
        "font-aeonik text-[#242424] text-[1.7rem] md:text-[2.5rem] leading-tight",
        className,
      )}
    >
      {children}
    </h2>
  );
}

interface ParagraphProps {
  children: React.ReactNode;
  className?: string;
  color?: "default" | "light" | "dark" | "gray-700" | "gray-500" | "gray-900";
  size?: "default" | "xs" | "sm" | "md" | "lg" | "lg-2";
  family?: "default" | "geist";
}

export function Paragraph({
  children,
  className,
  color = "default",
  size = "default",
  family = "default",
}: ParagraphProps) {
  const paragraphStyles = cva("", {
    variants: {
      color: {
        default: "text-[#848484]",
        light: "text-gray-400",
        dark: "text-[#3D3D3D]",
        "gray-700": "text-gray-700",
        "gray-500": "text-gray-500",
        "gray-900": "text-gray-900",
      },
      size: {
        default: "text-sm md:text-base",
        xs: "text-xs md:text-sm",
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
        "lg-2": "text-lg md:text-base",
      },
      family: {
        default: "",
        geist: "font-geist",
      },
    },
  });

  return (
    <p className={paragraphStyles({ color, size, family, className })}>
      {children}
    </p>
  );
}
