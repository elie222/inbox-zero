"use client";

import Image from "next/image";
import { PortableText } from "@portabletext/react";
import { client } from "@/sanity/lib/client";
import imageUrlBuilder from "@sanity/image-url";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import type { Post as PostType } from "@/app/blog/types";
import { Prose } from "@/app/blog/components/Prose";

const builder = imageUrlBuilder(client);

export function Post({ post }: { post: PostType }) {
  return (
    <BasicLayout>
      <article className="mx-auto max-w-xl px-6 py-20">
        <main className="container mx-auto px-4 py-16">
          <Prose>
            <h1>{post.title}</h1>
            <p>{post.description}</p>
            {post.mainImage ? (
              <Image
                src={builder.image(post.mainImage).width(480).height(300).url()}
                alt={post?.mainImage?.alt}
                width={480}
                height={300}
              />
            ) : null}
            {post.body ? <PortableText value={post.body} /> : null}
          </Prose>
        </main>
      </article>
    </BasicLayout>
  );
}
