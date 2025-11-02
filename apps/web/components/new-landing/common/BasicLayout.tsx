import { cn } from "@/utils";
import { Header } from "@/components/new-landing/sections/Header";
import { Footer } from "@/components/new-landing/sections/Footer";

const LAYOUT_STYLE = "max-w-6xl mx-auto px-6 lg:px-8";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header layoutStyle={LAYOUT_STYLE} />
      <main className={cn("isolate", LAYOUT_STYLE)}>{props.children}</main>
      <Footer layoutStyle={LAYOUT_STYLE} />
    </div>
  );
}
