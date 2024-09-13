import { Pricing } from "@/app/(app)/premium/Pricing";
import { Footer } from "@/app/(landing)/home/Footer";
import { CheckCircleIcon } from "lucide-react";

export default function WelcomeUpgradePage() {
  return (
    <div className="mt-8">
      <Pricing
        header={
          <div className="mb-8 flex flex-col items-start">
            <div className="mx-auto text-center">
              <h2 className="font-cal text-base leading-7 text-blue-600">
                Spend 50% less time on email
              </h2>
              <p className="mt-2 font-cal text-2xl text-gray-900 sm:text-3xl">
                Join 7,000+ users that use Inbox Zero
                <br />
                to be more productive!
              </p>
            </div>

            <div className="mx-auto mt-4 flex flex-col items-start gap-2">
              <TrialFeature>100% no-risk trial</TrialFeature>
              <TrialFeature>Pay nothing for the first 7 days</TrialFeature>
              <TrialFeature>Cancel anytime, hassle-free</TrialFeature>
            </div>
          </div>
        }
      />
      <Footer />
    </div>
  );
}

const TrialFeature = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center text-gray-900">
    <CheckCircleIcon className="mr-2 h-4 w-4 text-green-500" />
    {children}
  </p>
);
