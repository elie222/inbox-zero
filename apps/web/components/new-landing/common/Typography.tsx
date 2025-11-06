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
  color?: "default" | "light" | "dark" | "gray-700" | "gray-500";
  size?: "sm" | "lg" | "one" | "two";
}

export function Paragraph({
  children,
  className,
  color = "default",
  size = "one",
}: ParagraphProps) {
  const paragraphStyles = cva("", {
    variants: {
      variant: {
        "testimonial-body": "text-gray-500",
      },
      color: {
        default: "text-[#848484]",
        light: "text-gray-400",
        dark: "text-[#3D3D3D]",
        "gray-700": "text-gray-700",
        "gray-500": "text-gray-500",
      },
      size: {
        sm: "text-sm",
        one: "text-sm md:text-base",
        two: "text-lg md:text-base",
        lg: "text-lg",
      },
    },
  });

  return (
    <p className={paragraphStyles({ color, size, className })}>{children}</p>
  );
}
