// import { readdirSync } from "fs";
// import { join } from "path";
import Link from "next/link";

export default async function BlogPage() {
  // TODO gather metadata for all posts
  // const postsDirectory = join(process.cwd(), "app/blog/post/");
  // const posts = readdirSync(postsDirectory);

  const posts = [
    {
      name: "How my Open Source SaaS hit #1 on Product Hunt",
      file: "how-my-open-source-saas-hit-first-on-product-hunt",
    },
  ];

  return (
    <div>
      <h1>Blog</h1>
      <div className="">Posts</div>
      <ul>
        {posts.map((post) => (
          <li key={post.file}>
            <Link href={`/blog/post/${post.file}`}>{post.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
