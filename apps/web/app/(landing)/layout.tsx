import React, { Suspense } from "react";
import { PostHogPageview, PostHogProvider } from "@/providers/PostHogProvider";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense>
        <PostHogPageview />
      </Suspense>
      <PostHogProvider>{children}</PostHogProvider>
    </>
  );
}
