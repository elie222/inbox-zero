import { cn } from "@/utils";
import { Header } from "@/components/new-landing/sections/Header";
import { Footer } from "@/components/new-landing/sections/Footer";

const LAYOUT_CLASSNAME = "max-w-6xl mx-auto px-6 lg:px-8 xl:px-0";

export function BasicLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Header className={LAYOUT_CLASSNAME} />
      <main className={cn("isolate", LAYOUT_CLASSNAME)}>{children}</main>
      <Footer className={LAYOUT_CLASSNAME} />
    </div>
  );
}
