import Link from "next/link";
import { cn } from "@/utils";
import { FooterLineLogo } from "@/components/new-landing/FooterLineLogo";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import { footerNavigation } from "@/app/(landing)/home/Footer";

interface FooterProps {
  className: string;
  variant?: "default" | "simple";
}

export function Footer({ className, variant = "default" }: FooterProps) {
  return (
    <footer className="relative z-50 border-t border-[#E7E7E7A3] bg-cover bg-center bg-no-repeat overflow-hidden">
      {variant === "default" ? <UnicornScene className="opacity-15" /> : null}
      <div
        className={cn("overflow-hidden px-6 py-20 sm:py-24 lg:px-8", className)}
      >
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            {footerNavigation.main.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                target={item.target}
                prefetch={item.target !== "_blank"}
                className="text-sm leading-6 text-gray-600 hover:text-gray-900"
              >
                {item.name}
              </Link>
            ))}
            {footerNavigation.legal.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm leading-6 text-gray-600 hover:text-gray-900"
              >
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4">
            {footerNavigation.social.map((item) => (
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
          <p className="text-center text-xs leading-5 text-gray-500">
            &copy; {new Date().getFullYear()} Inbox Zero. Self-hosted instance.
          </p>
        </div>
      </div>
      {variant === "default" ? (
        <FooterLineLogo className="hidden xl:block absolute bottom-0 left-1/2 -translate-x-1/2 mx-auto px-6 lg:px-8 -z-10" />
      ) : null}
    </footer>
  );
}
