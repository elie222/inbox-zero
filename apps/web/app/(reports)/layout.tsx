import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, LogIn, UserPlus, Shield } from "lucide-react";
import { isAdmin } from "@/utils/admin";
import { ErrorPage } from "@/components/ErrorPage";

export const metadata: Metadata = {
  title: "Sandbox - Email Analysis",
  description: "Email analysis sandbox environment",
};

async function AuthStatus() {
  const session = await auth();

  if (session?.user) {
    const userIsAdmin = isAdmin({ email: session.user.email });

    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-gray-600" />
          <span className="text-sm text-gray-700">{session.user.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Authenticated
          </Badge>
          {userIsAdmin && (
            <Badge
              variant="default"
              className="text-xs bg-blue-600 flex items-center gap-1"
            >
              <Shield className="h-3 w-3" />
              Admin
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className="text-xs text-amber-600 border-amber-200"
      >
        Not Authenticated
      </Badge>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/login" className="flex items-center gap-1">
            <LogIn className="h-3 w-3" />
            Login
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/login" className="flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            Sign Up
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default async function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Require authentication
  if (!session?.user.email) {
    redirect("/login");
  }

  // Require admin access
  if (!isAdmin({ email: session.user.email })) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorPage
          title="Admin Access Required"
          description="You need administrator privileges to access the Email Intelligence Sandbox. Please contact your system administrator if you believe you should have access."
          button={
            <Button asChild>
              <Link href="/">Return to Home</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/sandbox"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Email Intelligence Sandbox
                </h1>
              </Link>
              <Badge variant="outline" className="text-xs">
                Development Environment
              </Badge>
            </div>
            <AuthStatus />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
