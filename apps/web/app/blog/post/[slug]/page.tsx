import { sanityFetch } from "@/sanity/lib/fetch";
import { postPathsQuery, postQuery } from "@/sanity/lib/queries";
import { client } from "@/sanity/lib/client";
import { Post } from "@/app/blog/post/[slug]/Post";
import type { Post as PostType } from "@/app/blog/types";

export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await client.fetch(postPathsQuery);
  return posts;
}

// Multiple versions of this page will be statically generated
// using the `params` returned by `generateStaticParams`
export default async function Page({ params }: { params: any }) {
  const post = await sanityFetch<PostType>({ query: postQuery, params });

  return <Post post={post} />;
}
