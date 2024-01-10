import { Metadata } from "next";
import { allLegalPosts } from "contentlayer/generated";
import { LegalPage } from "@/components/LegalPage";
import { env } from "@/env.mjs";

export const metadata: Metadata = {
  title: "Terms of Service - Inbox Zero",
  description: "Terms of Service - Inbox Zero",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  if (env.DISABLE_CONTENT_LAYER) return <div>Content layer is disabled</div>;

  const post = allLegalPosts.find(
    (post) => post._raw.flattenedPath === "terms",
  );
  if (!post) throw new Error(`Post not found for slug: "terms"`);

  return (
    <LegalPage
      date={post.updatedAt}
      title={post.title}
      content={post.body.html}
    />
  );
}
