"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  BarChart,
  Inbox,
  Tag,
  MessageCircleReply,
  ShieldCheck,
  Ribbon,
  LogOutIcon,
  Palette,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/utils/auth-client";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { logOut } from "@/utils/user";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useTheme } from "next-themes";
import { ProfileImage } from "@/components/ProfileImage";

export function NavUser() {
  const { data: session } = useSession();
  const { emailAccountId, emailAccount, provider } = useAccount();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="flex items-center px-3 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md"
      >
        Sign in
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="-m-1.5 flex items-center p-1.5 focus:outline-none"
        >
          <span className="sr-only">Open user menu</span>
          <ProfileImage
            image={emailAccount?.image || null}
            label={emailAccount?.name || emailAccount?.email || ""}
            size={32}
          />
          <span className="hidden lg:flex lg:items-center">
            <ChevronsUpDown
              className="ml-2 h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-52 origin-top-right rounded-md"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <ProfileImage
              image={emailAccount?.image || null}
              label={emailAccount?.name || emailAccount?.email || ""}
              size={32}
            />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {emailAccount?.name || emailAccount?.email || "Account"}
              </span>
              <span className="truncate text-xs">{session.user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Theme Toggle */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setTheme(theme === "dark" ? "light" : "dark");
          }}
        >
          <Palette className="mr-2 h-4 w-4" />
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {/* Navigation Items */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={prefixPath(emailAccountId, "/usage")}>
              <BarChart className="mr-2 h-4 w-4" />
              Usage
            </Link>
          </DropdownMenuItem>

          {isGoogleProvider(provider) && (
            <>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/mail")}>
                  <Inbox className="mr-2 h-4 w-4" />
                  Mail (Beta)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/reply-zero")}>
                  <MessageCircleReply className="mr-2 h-4 w-4" />
                  Reply Zero
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/cold-email-blocker")}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Cold Email Blocker
                </Link>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuItem asChild>
            <Link href="/early-access">
              <Ribbon className="mr-2 h-4 w-4" />
              Early Access
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logOut(window.location.origin)}>
          <LogOutIcon className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
