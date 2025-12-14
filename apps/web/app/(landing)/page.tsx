import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    // User is logged in - redirect to mail
    redirect("/mail");
  }

  // Not logged in - redirect to login
  redirect("/login");
}
