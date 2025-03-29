"use client";

import Link from "next/link";
import {
  Mail,
  Newspaper,
  Megaphone,
  Calendar,
  Receipt,
  Bell,
  Users,
} from "lucide-react";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ActionType = "label" | "label_archive" | "none";

export default function OnboardingPage() {
  return (
    <div>
      <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
        <CategoriesStep />
      </Card>
    </div>
  );
}

function CategoriesStep() {
  return (
    <div>
      <TypographyH3 className="mt-2">Set up your assistant</TypographyH3>

      <TypographyP className="mt-2">
        Choose how you want your emails organized.
        <br />
        You can add custom categories and rules later.
      </TypographyP>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <CategoryCard
          label="To Reply"
          // description="Emails that need a reply"
          icon={<Mail className="h-5 w-5 text-blue-500" />}
          defaultAction="label"
        />
        <CategoryCard
          label="Newsletters"
          // description="Newsletters emails"
          icon={<Newspaper className="h-5 w-5 text-purple-500" />}
          defaultAction="label"
        />
        <CategoryCard
          label="Marketing"
          // description="Promotional emails"
          icon={<Megaphone className="h-5 w-5 text-green-500" />}
          defaultAction="label_archive"
        />
        <CategoryCard
          label="Calendar"
          // description="Calendar events"
          icon={<Calendar className="h-5 w-5 text-yellow-500" />}
          defaultAction="label"
        />
        <CategoryCard
          label="Receipts"
          // description="Receipts and invoices for purchases"
          icon={<Receipt className="h-5 w-5 text-orange-500" />}
          defaultAction="label"
        />
        <CategoryCard
          label="Notifications"
          // description="Notifications from apps and services"
          icon={<Bell className="h-5 w-5 text-red-500" />}
          defaultAction="label"
        />
        <CategoryCard
          label="Cold Emails"
          // description="Cold emails"
          icon={<Users className="h-5 w-5 text-indigo-500" />}
          defaultAction="label_archive"
        />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button className="w-full" size="lg" asChild>
          <Link href="/automation/onboarding/draft-replies">Next</Link>
        </Button>

        <Button className="w-full" size="lg" variant="outline" asChild>
          <Link href="/automation/onboarding/draft-replies">Skip</Link>
        </Button>
      </div>
    </div>
  );
}

function CategoryCard({
  label,
  icon,
  defaultAction,
}: {
  label: string;
  icon: React.ReactNode;
  defaultAction: ActionType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {icon}
        <div className="flex-1">{label}</div>
        <div className="ml-auto flex items-center gap-4">
          <Select defaultValue={defaultAction}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="label">Label</SelectItem>
              <SelectItem value="label_archive">Label + Skip Inbox</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
