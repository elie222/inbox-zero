"use client";

import { BlogPost } from "@/app/blog/components/BlogPost";
import MdxContent from "./content.mdx";

export function Content() {
  return (
    <BlogPost
      date="2024-01-21"
      title="How to rank first on Product Hunt"
      content={<MdxContent />}
    />
  );
}
