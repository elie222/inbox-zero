import type { PortableTextBlock } from "next-sanity";

export type Post = {
  title: string;
  description: string | null;
  mainImage: {
    _type: "image";
    alt: string;
    asset: {
      _ref: string;
      _type: "reference";
    };
  } | null;
  markdownContent: string | null;
  body: PortableTextBlock[] | null;
  authorName: string | null;
  authorImage: string | null;
  authorTwitter: string | null;
};
