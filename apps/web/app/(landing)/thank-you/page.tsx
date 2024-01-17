import { Footer } from "@/app/(landing)/home/Footer";
import { Header } from "@/app/(landing)/home/Header";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";

// same component as not-found
export default function ThankYouPage() {
  return (
    <div className="bg-white">
      <Header />

      <div className="pb-40 pt-60">
        <Card className="mx-auto max-w-xl text-center">
          <PageHeading>Thank you!</PageHeading>
          <div className="mt-2">
            <TypographyP>
              Your premium purchase was successful. Thank you for supporting us!
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/welcome" }}>
            Continue
          </Button>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
