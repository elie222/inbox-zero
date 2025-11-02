import { Header } from "./Header";
import { Footer } from "./Footer";
import { cn } from "@/utils";

const MAX_WIDTH = "max-w-6xl";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header maxWidth={MAX_WIDTH} />
      <main className={cn("isolate mx-auto px-6 lg:px-8", MAX_WIDTH)}>
        {props.children}
      </main>
      <Footer maxWidth={MAX_WIDTH} />
    </div>
  );
}
