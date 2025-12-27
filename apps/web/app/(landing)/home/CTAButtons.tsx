import { Button } from "@/components/Button";

export function CTAButtons() {
  return (
    <div className="flex justify-center mt-10">
      <Button size="2xl" color="blue" link={{ href: "/login" }}>
        Sign In
      </Button>
    </div>
  );
}
