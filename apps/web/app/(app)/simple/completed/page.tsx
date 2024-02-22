import { Celebration } from "@/components/Celebration";

export default async function SimpleCompletedPage() {
  return (
    <div className="py-20">
      <Celebration message="You've handled all emails for the day!" />
    </div>
  );
}
