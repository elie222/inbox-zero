import { cva } from "class-variance-authority";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function Button({ children, variant = "primary" }: ButtonProps) {
  const buttonVariants = cva("py-2 px-4 rounded-2xl", {
    variants: {
      variant: {
        primary: "bg-gradient-to-b from-[#2563EB] to-[#6595FF] text-white",
        secondary: "bg-white border border-gray-200 text-gray-700",
      },
    },
  });

  return (
    <button type="button" className={buttonVariants({ variant })}>
      {children}
    </button>
  );
}
