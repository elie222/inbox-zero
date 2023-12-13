import Link from "next/link";

const navigation = {
  main: [
    { name: "Newsletter Cleaner", href: "/newsletter-cleaner" },
    { name: "Open Source", href: "/github" },
    { name: "OSS Friends", href: "/oss-friends" },
  ],
  legal: [
    { name: "Terms", href: "/terms" },
    { name: "Privacy", href: "/privacy" },
  ],
  support: [
    { name: "Pricing", href: "/#pricing" },
    { name: "Feature Requests", href: "/feature-requests" },
    { name: "Roadmap", href: "/roadmap" },
  ],
  company: [
    { name: "Affiliates", href: "/affiliates" },
    { name: "Twitter", href: "/twitter" },
    { name: "GitHub", href: "/github" },
    { name: "Discord", href: "/discord" },
  ],
  social: [
    {
      name: "Twitter",
      href: "/twitter",
      icon: (props: any) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
        </svg>
      ),
    },
    {
      name: "GitHub",
      href: "/github",
      icon: (props: any) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      name: "Discord",
      href: "/discord",
      icon: (props: any) => (
        <svg width="100" height="100" viewBox="0 0 48 48" {...props}>
          <path
            fill="currentColor"
            d="M40,12c0,0-4.585-3.588-10-4l-0.488,0.976C34.408,10.174,36.654,11.891,39,14c-4.045-2.065-8.039-4-15-4s-10.955,1.935-15,4c2.346-2.109,5.018-4.015,9.488-5.024L18,8c-5.681,0.537-10,4-10,4s-5.121,7.425-6,22c5.162,5.953,13,6,13,6l1.639-2.185C13.857,36.848,10.715,35.121,8,32c3.238,2.45,8.125,5,16,5s12.762-2.55,16-5c-2.715,3.121-5.857,4.848-8.639,5.815L33,40c0,0,7.838-0.047,13-6C45.121,19.425,40,12,40,12z M17.5,30c-1.933,0-3.5-1.791-3.5-4c0-2.209,1.567-4,3.5-4s3.5,1.791,3.5,4C21,28.209,19.433,30,17.5,30z M30.5,30c-1.933,0-3.5-1.791-3.5-4c0-2.209,1.567-4,3.5-4s3.5,1.791,3.5,4C34,28.209,32.433,30,30.5,30z"
          />
        </svg>
      ),
    },
  ],
};

export function Footer() {
  return (
    <footer className="relative z-50">
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-20 sm:py-24 lg:px-8">
        <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
          <div className="md:grid md:grid-cols-2 md:gap-8">
            <div>
              <FooterList title="Product" items={navigation.main} />
            </div>
            <div className="mt-10 md:mt-0">
              <FooterList title="Support" items={navigation.support} />
            </div>
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-8">
            <div>
              <FooterList title="Company" items={navigation.company} />
            </div>
            <div className="mt-10 md:mt-0">
              <FooterList title="Legal" items={navigation.legal} />
            </div>
          </div>
        </div>

        <div className="mt-16 flex justify-center space-x-10">
          {navigation.social.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">{item.name}</span>
              <item.icon className="h-6 w-6" aria-hidden="true" />
            </Link>
          ))}
        </div>
        <p className="mt-10 text-center text-xs leading-5 text-gray-500">
          &copy; {new Date().getFullYear()} Inbox Zero. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterList(props: {
  title: string;
  items: { name: string; href: string }[];
}) {
  return (
    <>
      <h3 className="text-sm font-semibold leading-6 text-gray-900">
        {props.title}
      </h3>
      <ul role="list" className="mt-6 space-y-4">
        {props.items.map((item) => (
          <li key={item.name}>
            <a
              href={item.href}
              className="text-sm leading-6 text-gray-600 hover:text-gray-900"
            >
              {item.name}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
