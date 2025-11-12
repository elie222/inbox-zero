"use client";

import Link from "next/link";
import {
  HomeIcon,
  UserIcon,
  RocketIcon,
  BuildingIcon,
  HeadphonesIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { cn } from "@/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

const navigation = [
  { name: "Enterprise", href: "/enterprise" },
  { name: "Open Source", href: "/github", target: "_blank" as const },
  { name: "Pricing", href: "/#pricing" },
];

const useCases = [
  {
    title: "Founders",
    href: "/founders",
    description: "Scale your startup while AI handles your inbox",
    icon: RocketIcon,
    iconColor: "text-[#6410FF]",
    borderColor: "from-[#E1D5FC] to-[#D7C3FC]",
    gradient: "from-[#F3EAFE] to-[#E7DAFF]",
    hoverBg: "hover:bg-[#F3EAFE70]",
  },
  {
    title: "Small Business",
    href: "/small-business",
    description: "Grow your business with automated email management",
    icon: BuildingIcon,
    iconColor: "text-[#30A24B]",
    borderColor: "from-[#DDF4D3] to-[#CFF4C0]",
    gradient: "from-[#F3FFEF] to-[#E1FFD8]",
    hoverBg: "hover:bg-[#F3FFEF]",
  },
  {
    title: "Content Creators",
    href: "/creator",
    description: "Streamline brand partnerships and collaborations",
    icon: UserIcon,
    iconColor: "text-[#006EFF]",
    borderColor: "from-[#D6E8FC] to-[#C3DEFC]",
    gradient: "from-[#EFF6FF] to-[#D8E9FF]",
    hoverBg: "hover:bg-[#EFF6FF80]",
  },
  {
    title: "Real Estate",
    href: "/real-estate",
    description: "AI email management for real estate professionals",
    icon: HomeIcon,
    iconColor: "text-[#C942B2]",
    borderColor: "from-[#FDD3EB] to-[#FDBFE0]",
    gradient: "from-[#FFEEF8] to-[#FFDAEC]",
    hoverBg: "hover:bg-[#FFEEF870]",
  },
  {
    title: "Customer Support",
    href: "/support",
    description: "Deliver faster support with AI-powered responses",
    icon: HeadphonesIcon,
    iconColor: "text-[#E65707]",
    borderColor: "from-[#FCE2D5] to-[#FCD6C2]",
    gradient: "from-[#FFF5EF] to-[#FFE7DA]",
    hoverBg: "hover:bg-[#FFF5EF80]",
  },
  {
    title: "E-commerce",
    href: "/ecommerce",
    description: "Automate order updates and customer communications",
    icon: ShoppingCartIcon,
    iconColor: "text-[#124DFF]",
    borderColor: "from-[#D5DEFC] to-[#C2D0FC]",
    gradient: "from-[#EFF3FF] to-[#D9E2FF]",
    hoverBg: "hover:bg-[#EFF3FF80]",
  },
];

export function HeaderLinks() {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-x-8">
      <NavigationMenu>
        <NavigationMenuList>
          {/* Solutions Dropdown */}
          <NavigationMenuItem>
            <NavigationMenuTrigger className="text-sm font-semibold font-geist leading-6 text-gray-900">
              Solutions
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[640px] grid-cols-2 gap-2 p-4">
                {useCases.map((useCase) => (
                  <EnhancedListItem
                    key={useCase.title}
                    title={useCase.title}
                    href={useCase.href}
                    icon={useCase.icon}
                    iconColor={useCase.iconColor}
                    gradient={useCase.gradient}
                    borderColor={useCase.borderColor}
                    hoverBg={useCase.hoverBg}
                  >
                    {useCase.description}
                  </EnhancedListItem>
                ))}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>

          {/* Regular Navigation Items */}
          {navigation.map((item) => (
            <NavigationMenuItem key={item.name}>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
              >
                <Link
                  href={item.href}
                  target={item.target}
                  prefetch={item.target !== "_blank"}
                  className="text-sm font-semibold font-geist leading-6 text-gray-900"
                >
                  {item.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}

function EnhancedListItem({
  title,
  children,
  href,
  icon: Icon,
  iconColor,
  gradient,
  borderColor,
  hoverBg,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  href: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  gradient: string;
  borderColor: string;
  hoverBg: string;
}) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className={cn(
            "group block select-none space-y-1 rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 focus:bg-accent focus:text-accent-foreground",
            hoverBg,
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "p-px rounded-lg shadow-sm bg-gradient-to-b",
                borderColor,
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b shadow-sm transition-transform",
                  gradient,
                )}
              >
                <Icon className={cn("h-4 w-4", iconColor)} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-none text-gray-900 group-hover:text-gray-800">
                {title}
              </div>
              <p className="mt-1 text-sm leading-snug text-gray-600 group-hover:text-gray-700">
                {children}
              </p>
            </div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
