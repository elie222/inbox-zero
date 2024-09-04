import { PortableTextBlock } from "next-sanity";

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
  body: PortableTextBlock[] | null;
};
