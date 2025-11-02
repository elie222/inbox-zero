import { Logo } from "./Logo";
import { Button } from "./Button";
import { cn } from "@/utils";

interface HeaderProps {
  maxWidth: string;
}

export function Header({ maxWidth }: HeaderProps) {
  return (
    <header
      className={cn(
        "bg-white mx-auto flex items-center justify-between h-16",
        maxWidth,
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
