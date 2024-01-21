import Link from "next/link";

export default function BlogPage() {
  return (
    <div>
      <h1>Blog</h1>
      <div className="">Posts</div>
      <ul>
        <li>
          <Link href="/blog/post/product-hunt">
            How to rank an open source project fist on Product Hunt
          </Link>
        </li>
      </ul>
    </div>
  );
}
