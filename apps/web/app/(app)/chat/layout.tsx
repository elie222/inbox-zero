import { TooltipProvider } from "@/components/ui/tooltip";
import { AI } from "./action";

// export const runtime = 'edge';

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TooltipProvider>
      <AI>{children}</AI>
    </TooltipProvider>
  );
}
