import type { Post as PostType } from "@/app/(marketing)/blog/types";
import { BlogLayout } from "@/components/layouts/BlogLayout";
import { Card, CardContent } from "@/components/ui/card";
import { sanityFetch } from "@/app/(marketing)/sanity/lib/fetch";
import { postsQuery } from "@/app/(marketing)/sanity/lib/queries";
import Image from "next/image";
import Link from "next/link";

type Post = {
  title: string;
  file: string;
  description: string;
  date: string;
  datetime: string;
  author: { name: string; role: string; href: string; imageUrl: string };
  imageUrl: string;
};

type SanityPost = {
  title: string;
  description: string | null;
  slug: { current: string; _type: "slug" };
  mainImage: PostType["mainImage"];
  imageURL: string | null;
  authorName: string;
  _createdAt: string;
};

const mdxPosts: Post[] = [
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
    imageUrl: "/images/reach-inbox-zero.png",
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
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title:
      "Escape the Email Trap: How to Unsubscribe for Good When Senders Won't Let Go",
    file: "escape-email-trap-unsubscribe-for-good",
    description:
      "End unwanted emails permanently. Discover tactics to block persistent senders who disregard unsubscribe requests and spam reports.",
    date: "Aug 22, 2024",
    datetime: "2024-08-22",
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
    imageUrl: "/images/reach-inbox-zero.png",
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
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "How to Bulk Unsubscribe from Emails",
    file: "bulk-unsubscribe-from-emails",
    description:
      "Want to stop the flood of unwanted subscriptions in your email? Learn how to bulk unsubscribe from emails and create a clutter-free inbox with Inbox Zero.",
    date: "March 05, 2024",
    datetime: "2024-03-05",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Best Email Unsubscribe App to Clean Up Your Inbox",
    file: "best-email-unsubscribe-app",
    description:
      "Managing your email inbox can feel like a full-time job. With promotional emails, newsletters, and updates flooding our inboxes daily, it's crucial to have effective tools to maintain order.",
    date: "June 26, 2024",
    datetime: "2024-06-26",
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Boost Your Email Efficiency with These Gmail Productivity Hacks",
    file: "gmail-productivity-hacks",
    description:
      "Discover effective Gmail productivity hacks to streamline your email management. Learn key tips, tools, and techniques for maximizing efficiency.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Achieve Mental Clarity with Inbox Zero",
    file: "inbox-zero-benefits-for-mental-health",
    description:
      "Learn how to achieve and maintain Inbox Zero for better mental health. Reduce stress, boost productivity, and gain mental clarity with these strategies.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Mastering Inbox Zero - A Productivity Guide for Entrepreneurs",
    file: "inbox-zero-workflow-for-entrepreneurs",
    description:
      "Learn how to achieve and maintain Inbox Zero as an entrepreneur with effective strategies, tools, and tips for efficient email management.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "How to Beat Email Stress as a Remote Worker",
    file: "managing-email-stress-for-remote-workers",
    description:
      "Learn effective strategies and tools to manage email stress for remote workers. Increase productivity and work-life balance with expert recommendations.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Master Email Management with These Top Tips and Tools",
    file: "email-management-best-practices",
    description:
      "Learn the best email management practices to boost productivity and efficiency. Discover tools and techniques for effective inbox organization.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
];

export const revalidate = 60;

export default async function BlogContentsPage() {
  // Skip Sanity fetch during build with dummy credentials
  let posts: SanityPost[] = [];
  if (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "project123") {
    posts = await sanityFetch<SanityPost[]>({ query: postsQuery });
  }

  return (
    <BlogLayout>
      <Posts posts={posts} />
    </BlogLayout>
  );
}

function Posts({ posts }: { posts: SanityPost[] }) {
  const allPosts: Post[] = [
    ...posts.map((post) => ({
      title: post.title,
      file: post.slug.current,
      description: post.description ?? "",
      date: new Date(post._createdAt).toLocaleDateString(),
      datetime: post._createdAt,
      author: {
        name: post.authorName,
        role: "Founder",
        href: "#",
        imageUrl: "/images/blog/elie-profile.jpg",
      },
      imageUrl: post.imageURL ?? "/images/reach-inbox-zero.png",
    })),
    ...mdxPosts,
  ];

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="mb-8 font-title text-3xl tracking-tight text-gray-900 sm:text-4xl">
          From the blog
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {allPosts.map((post) => (
            <PostCard key={post.title} post={post} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Card className="overflow-hidden transition-transform duration-300 hover:scale-105">
      <Link href={`/blog/post/${post.file}`}>
        <div className="relative h-48 w-full">
          <Image
            src={post.imageUrl}
            alt={post.title}
            layout="fill"
            objectFit="cover"
          />
        </div>
        <CardContent className="pt-4">
          <h3 className="mb-2 font-title text-lg leading-6 text-gray-900 group-hover:text-gray-600">
            {post.title}
          </h3>
          <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-600">
            {post.description}
          </p>
          <div className="flex items-center gap-x-4">
            <Image
              src={post.author.imageUrl}
              alt=""
              className="h-8 w-8 rounded-full bg-gray-50"
              width={32}
              height={32}
            />
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{post.author.name}</p>
              <time dateTime={post.datetime} className="text-gray-500">
                {post.date}
              </time>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
