import { cn } from "@/utils";
import { Logo } from "@/components/new-landing/common/Logo";
import { Button } from "@/components/new-landing/common/Button";
import { HeaderLinks } from "@/components/new-landing/HeaderLinks";

interface HeaderProps {
  className: string;
}

export function Header({ className }: HeaderProps) {
  return (
    <header
      className={cn(
        "bg-white mx-auto flex items-center justify-between h-16",
        className,
      )}
    >
      <div className="hidden md:block">
        <Logo />
      </div>
      <div className="block md:hidden">
        <Logo variant="mobile" />
      </div>
      <HeaderLinks />
      <div className="flex items-center gap-3">
        <Button variant="secondary">Log in</Button>
        <Button>Get started free</Button>
      </div>
    </header>
  );
}
