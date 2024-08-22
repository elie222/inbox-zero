import React from "react";
import { defineQuery } from "next-sanity";
// import Image from "next/image";
import { client } from "../../../../../sanity/lib/client";

export const POST_QUERY =
  defineQuery(`*[_type == "post" && slug.current == $slug][0]{
  title, body, mainImage
}`);

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await client.fetch(POST_QUERY, { slug: params.slug });
  console.log("🚀 ~ post:", post);

  return (
    <div className="bg-red-500 p-4">
      <h1>{post.title}</h1>
      {/* <div>{post.body}</div>
      <img src={post.mainImage} alt={post.title} /> */}
    </div>
  );
}
