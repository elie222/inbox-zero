import { Header } from "@/components/new-landing/sections/Header";
import { Footer } from "@/components/new-landing/sections/Footer";

export function BlogHeader() {
  return (
    <div className="sticky inset-x-0 top-0 z-30 w-full transition-all">
      <div className="bg-white/75 shadow backdrop-blur-md">
        <Header className="mx-auto w-full max-w-screen-xl px-6 lg:px-8" />
      </div>
    </div>
  );
}

export function BlogLayout(props: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50">
      <BlogHeader />
      <main className="isolate">{props.children}</main>
      <div className="mt-20">
        <Footer
          variant="simple"
          className="mx-auto w-full max-w-screen-xl px-0"
        />
      </div>
    </div>
  );
}
