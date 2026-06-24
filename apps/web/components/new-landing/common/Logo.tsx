import Link from "next/link";
import { Logo as Wordmark } from "@/components/Logo";
import { cn } from "@/utils";

interface LogoProps {
  variant?: "default" | "mobile";
}

export function Logo({ variant = "default" }: LogoProps) {
  const sizeClass = variant === "mobile" ? "h-4 w-auto" : "h-5 w-auto";

  return (
    <Link href="/">
      <Wordmark className={cn(sizeClass, "text-gray-900")} />
    </Link>
  );
}
