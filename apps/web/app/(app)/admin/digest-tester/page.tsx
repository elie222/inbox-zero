import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { ErrorPage } from "@/components/ErrorPage";
import { TopSection } from "@/components/TopSection";
import { DigestTesterContent } from "./DigestTesterContent";

export default async function DigestTesterPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  return (
    <div>
      <TopSection
        title="Digest Tester"
        description="Test digest generation using production flow with curated Gmail emails"
      />
      <DigestTesterContent />
    </div>
  );
}
