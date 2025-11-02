import { cn } from "@/utils";
import { Logo } from "@/components/new-landing/common/Logo";
import { Button } from "@/components/new-landing/common/Button";

interface HeaderProps {
  layoutStyle: string;
}

export function Header({ layoutStyle }: HeaderProps) {
  return (
    <header
      className={cn(
        "bg-white mx-auto flex items-center justify-between h-16",
        layoutStyle,
      )}
    >
      <Logo />
      <div className="flex items-center gap-3">
        <Button variant="secondary">Log in</Button>
        <Button>Get started free</Button>
      </div>
    </header>
  );
}
