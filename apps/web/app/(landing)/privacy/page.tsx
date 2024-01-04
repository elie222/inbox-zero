import { Metadata } from "next";
import { allLegalPosts } from "contentlayer/generated";
import { LegalPage } from "@/components/LegalPage";
import { env } from "@/env.mjs";

export const metadata: Metadata = {
  title: "Privacy Policy - Inbox Zero",
  description: "Privacy Policy - Inbox Zero",
};

export default function Terms() {
  if (env.DISABLE_CONTENT_LAYER) return <div>Content layer is disabled</div>;

  const post = allLegalPosts.find(
    (post) => post._raw.flattenedPath === "privacy",
  );
  if (!post) throw new Error(`Post not found for slug: "privacy"`);

  return (
    <LegalPage
      date={post.updatedAt}
      title={post.title}
      content={post.body.html}
    />
  );
}
