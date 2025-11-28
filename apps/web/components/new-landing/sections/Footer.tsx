import Link from "next/link";
import { Logo } from "@/components/new-landing/common/Logo";
import { cn } from "@/utils";
import { FooterLineLogo } from "@/components/new-landing/FooterLineLogo";
import { Paragraph } from "@/components/new-landing/common/Typography";
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
        <div className="mt-16 grid grid-cols-2 gap-8 lg:grid-cols-5 xl:col-span-2 xl:mt-0">
          <div>
            <FooterList title="Product" items={footerNavigation.main} />
          </div>
          <div>
            <FooterList title="Use Cases" items={footerNavigation.useCases} />
          </div>
          <div>
            <FooterList title="Support" items={footerNavigation.support} />
          </div>
          <div>
            <FooterList title="Company" items={footerNavigation.company} />
          </div>
          <div>
            <FooterList title="Legal" items={footerNavigation.legal} />
            <div className="mt-6">
              <FooterList title="Compare" items={footerNavigation.compare} />
            </div>
          </div>
        </div>
        <div className="mt-40 flex items-center justify-between">
          <Logo variant="glass" />
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
        </div>
      </div>
      {variant === "default" ? (
        <FooterLineLogo className="hidden xl:block absolute bottom-0 left-1/2 -translate-x-1/2 mx-auto px-6 lg:px-8 -z-10" />
      ) : null}
    </footer>
  );
}

function FooterList(props: {
  title: string;
  items: { name: string; href: string; target?: string }[];
}) {
  return (
    <>
      <Paragraph
        color="gray-900"
        size="sm"
        className="font-semibold leading-6"
        as="h3"
      >
        {props.title}
      </Paragraph>
      <ul className="mt-6 space-y-3">
        {props.items.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              target={item.target}
              prefetch={item.target !== "_blank"}
              className="text-sm leading-6 text-gray-500 hover:text-gray-900"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
