import { Footer } from "@/app/(landing)/home/Footer";
import { Header } from "@/app/(landing)/home/Header";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";

export default function NotFound() {
  return (
    <div className="bg-white">
      <Header />

      <div className="pb-40 pt-60">
        <Card className="mx-auto max-w-xl text-center">
          <PageHeading>Page Not Found</PageHeading>
          <div className="mt-2">
            <TypographyP>
              The page you are looking for could not be found.
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/" }}>
            Return Home
          </Button>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
