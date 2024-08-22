import React from "react";
import { defineQuery } from "next-sanity";
import { client } from "../../../sanity/lib/client";

export const POSTS_QUERY =
  defineQuery(`*[_type == "post" && defined(slug.current)][0...12]{
  _id, title, slug
}`);

export default async function PostIndex() {
  const posts = await client.fetch(POSTS_QUERY);

  return (
    <ul>
      {posts.map((post) => (
        <li key={post._id}>
          <a href={`/blog/sanity/post/${post?.slug.current}`}>{post?.title}</a>
        </li>
      ))}
    </ul>
  );
}
