import { Header } from "./Header";
import { Footer } from "./Footer";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div>
      <Header />
      <main className="isolate">{props.children}</main>
      <Footer />
    </div>
  );
}
