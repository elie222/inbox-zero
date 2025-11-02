import { Logo } from "./Logo";
import { Button } from "./Button";

export function Header() {
  return (
    <header className="bg-white mx-auto max-w-7xl flex items-center justify-between h-16">
      <Logo />
      <div className="flex items-center gap-3">
        <Button variant="secondary">Log in</Button>
        <Button>Get started free</Button>
      </div>
    </header>
  );
}
