// import { readdirSync } from "fs";
// import { join } from "path";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import Image from "next/image";
import Link from "next/link";

const posts = [
  {
    title: "How Inbox Zero hit #1 on Product Hunt",
    file: "how-my-open-source-saas-hit-first-on-product-hunt",
    description:
      "Two weeks ago I launched Inbox Zero on Product Hunt. It finished in first place with over 1000 upvotes and gained thousands of new users. The app, Inbox Zero, helps you clean up your inbox fast. It lets you bulk unsubscribe from newsletters, automate emails with an AI assistant, automatically block cold emails, and provides email analytics.",
    date: "Jan 22, 2024",
    datetime: "2024-01-22",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
  },
  {
    title: "Why Build An Open Source SaaS",
    file: "why-build-an-open-source-saas",
    description:
      "Open source SaaS products are blowing up. This is why you should consider building one.",
    date: "Jan 25, 2024",
    datetime: "2024-01-25",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
  },
  {
    title: "Alternatives to Skiff Mail",
    file: "alternatives-to-skiff-mail",
    description:
      "Notion recently aqcuired Skiff Mail and is sunsetting it in six months. Here are some good alternatives to consider for your email needs.",
    date: "Feb 22, 2024",
    datetime: "2024-02-22",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
  },
];

export default async function BlogPage() {
  // TODO gather metadata for all posts programatically
  // const postsDirectory = join(process.cwd(), "app/blog/post/");
  // const posts = readdirSync(postsDirectory);

  return (
    <BasicLayout>
      <Posts />
    </BasicLayout>
  );
}

function Posts() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-cal  text-3xl tracking-tight text-gray-900 sm:text-4xl">
            From the blog
          </h2>
          <p className="mt-2 text-lg leading-8 text-gray-600">
            Changelog and tips to better manage your email inbox.
          </p>
          <div className="mt-10 space-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16">
            {posts.map((post) => (
              <article
                key={post.title}
                className="flex max-w-xl flex-col items-start justify-between"
              >
                <div className="flex items-center gap-x-4 text-xs">
                  <time dateTime={post.datetime} className="text-gray-500">
                    {post.date}
                  </time>
                  {/* <a
                    href={post.category.href}
                    className="relative z-10 rounded-full bg-gray-50 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100"
                  >
                    {post.category.title}
                  </a> */}
                </div>
                <div className="group relative">
                  <h3 className="mt-3 font-cal text-lg leading-6 text-gray-900 group-hover:text-gray-600">
                    <Link href={`/blog/post/${post.file}`}>
                      <span className="absolute inset-0" />
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-5 line-clamp-3 text-sm leading-6 text-gray-600">
                    {post.description}
                  </p>
                </div>
                <div className="relative mt-8 flex items-center gap-x-4">
                  <Image
                    src={post.author.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-full bg-gray-50"
                    width={40}
                    height={40}
                  />
                  <div className="text-sm leading-6">
                    <p className="font-semibold text-gray-900">
                      <a href={post.author.href}>
                        <span className="absolute inset-0" />
                        {post.author.name}
                      </a>
                    </p>
                    <p className="text-gray-600">{post.author.role}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
