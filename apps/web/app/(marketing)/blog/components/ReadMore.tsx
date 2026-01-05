import Image from "next/image";
import Link from "next/link";
import { sanityFetch } from "@/app/(marketing)/sanity/lib/fetch";
import { recentPostsQuery } from "@/app/(marketing)/sanity/lib/queries";

type BlogPostPreview = {
  slug: string;
  title: string;
  description: string;
  date: string;
  image: string;
};

export async function ReadMore() {
  const blogPosts: BlogPostPreview[] = await sanityFetch<BlogPostPreview[]>({
    query: recentPostsQuery,
    tags: ["post"],
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {blogPosts.map((post) => (
        <Link
          key={post.slug}
          href={`/blog/post/${post.slug}`}
          className="block h-full"
        >
          <div className="flex h-full flex-col overflow-hidden rounded-lg shadow-md transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg">
            <Image
              src={post.image}
              alt={post.title}
              width={400}
              height={200}
              className="w-full object-cover"
            />
            <div className="flex flex-grow flex-col bg-white p-4 transition-colors duration-300 ease-in-out hover:bg-gray-50">
              <h3 className="mb-2 text-xl font-semibold transition-colors duration-300 ease-in-out hover:text-blue-600">
                {post.title}
              </h3>
              <p className="mb-2 flex-grow text-gray-600">{post.description}</p>
              <p className="text-sm text-gray-500">{post.date}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
