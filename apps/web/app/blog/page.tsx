import Image from "next/image";
import Link from "next/link";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { sanityFetch } from "@/sanity/lib/fetch";
import { postsQuery } from "@/sanity/lib/queries";
import { Post as PostType } from "@/app/blog/types";

type Post = {
  title: string;
  file: string;
  description: string;
  date: string;
  datetime: string;
  author: { name: string; role: string; href: string; imageUrl: string };
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
  },
  {
    title: "Mastering Inbox Zero - A Productivity Guide for Entrepreneurs",
    file: "inbox-zero-workflow-for-entrepreneurs",
    description:
      "Learn how to achieve and maintain Inbox Zero as an entrepreneur with effective strategies, tools, and tips for efficient email management.",
    date: "Jun 27, 2024",
    datetime: "2024-06-27",
    // category: { title: "Marketing", href: "#" },
    author: {
      name: "Ricardo Batista",
      role: "Founder @ AI Blog Articles",
      href: "https://getaiblogarticles.com/",
      imageUrl: "/images/blog/ricardo-batista-profile.png",
    },
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
  },
];

export default async function BlogPage() {
  const posts = await sanityFetch<SanityPost[]>({ query: postsQuery });

  return (
    <BasicLayout>
      <Posts posts={posts} />
    </BasicLayout>
  );
}

function Posts({ posts }: { posts: SanityPost[] }) {
  const allPosts: Post[] = [
    ...posts.map((post) => ({
      title: post.title,
      file: post.slug.current,
      description: post.description ?? "",
      date: post._createdAt,
      datetime: post._createdAt,
      author: {
        name: post.authorName,
        role: "Founder",
        href: "#",
        imageUrl: "/images/blog/elie-profile.jpg",
      },
    })),
    ...mdxPosts,
  ];

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-cal text-3xl tracking-tight text-gray-900 sm:text-4xl">
            From the blog
          </h2>
          <p className="mt-2 text-lg leading-8 text-gray-600">
            Changelog and tips to better manage your email inbox.
          </p>
          <div className="mt-10 space-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16">
            {allPosts.map((post) => (
              <PostCard key={post.title} post={post} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
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
          {post.description ?? "Read more..."}
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
  );
}
