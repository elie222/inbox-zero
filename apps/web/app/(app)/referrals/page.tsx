import { ReferralDashboard } from "@/app/(app)/referrals/ReferralDashboard";

export default function ReferralsPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <ReferralDashboard />
      </div>
    </div>
  );
}