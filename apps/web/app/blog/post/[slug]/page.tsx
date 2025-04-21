import type { ResolvingMetadata } from "next";
import { sanityFetch } from "@/sanity/lib/fetch";
import { postPathsQuery, postQuery } from "@/sanity/lib/queries";
import { client } from "@/sanity/lib/client";
import imageUrlBuilder from "@sanity/image-url";
import { Post } from "@/app/blog/post/[slug]/Post";
import type { Post as PostType } from "@/app/blog/types";
import { captureException } from "@/utils/error";

export const revalidate = 60;

export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === 'dummy-sanity-project-id-for-build') {
    return [];
  }
  const posts = await client.fetch(postPathsQuery);
  return posts;
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(
  props: Props,
  parent: ResolvingMetadata,
) {
  const params = await props.params;
  const post = await sanityFetch<PostType | undefined>({
    query: postQuery,
    params,
  });

  if (!post) {
    captureException(new Error(`Post not found. Slug: ${params.slug}`), {
      extra: {
        params,
        query: postQuery,
      },
    });
    return {};
  }

  const previousImages = (await parent).openGraph?.images || [];

  const builder = imageUrlBuilder(client);
  const imageUrl = post.mainImage
    ? builder
        .image(post.mainImage)
        .auto("format")
        .fit("max")
        .width(1200)
        .height(630)
        .url()
    : undefined;

  return {
    title: post.title,
    description: post.description ?? "",
    alternates: { canonical: `/blog/post/${params.slug}` },
    openGraph: {
      images: imageUrl ? [imageUrl, ...previousImages] : previousImages,
    },
  };
}

// Multiple versions of this page will be statically generated
// using the `params` returned by `generateStaticParams`
export default async function Page(props: Props) {
  const params = await props.params;
  const post = await sanityFetch<PostType>({ query: postQuery, params });

  if (!post) {
    return <div>Blog post content unavailable.</div>;
  }

  return <Post post={post} />;
}
