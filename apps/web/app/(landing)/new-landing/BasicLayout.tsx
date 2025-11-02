import { Header } from "./Header";
import { Footer } from "./Footer";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header />
      <main className="isolate mx-auto max-w-7xl">{props.children}</main>
      <Footer />
    </div>
  );
}
