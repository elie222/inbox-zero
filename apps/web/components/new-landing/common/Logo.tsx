import Image from "next/image";
import Link from "next/link";
import { Logo as Wordmark } from "@/components/Logo";
import { cn } from "@/utils";

interface LogoProps {
  variant?: "default" | "mobile" | "glass";
}

function GlassLogo() {
  return (
    <Image
      src="/images/new-landing/inbox-zero-glass.png"
      alt="Logo"
      width={142}
      height={19}
    />
  );
}

export function Logo({ variant = "default" }: LogoProps) {
  if (variant === "glass") {
    return (
      <Link href="/">
        <GlassLogo />
      </Link>
    );
  }

  const sizeClass = variant === "mobile" ? "h-4 w-auto" : "h-5 w-auto";

  return (
    <Link href="/">
      <Wordmark className={cn(sizeClass, "text-gray-900")} />
    </Link>
  );
}
