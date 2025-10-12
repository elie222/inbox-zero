import type { NextRequest } from "next/server";
import { render } from "@react-email/render";
import DigestEmail, {
  type DigestEmailProps,
} from "@inboxzero/resend/emails/digest";
import { digestPreviewBody } from "@/app/api/digest-preview/validation";

// http://localhost:3000/api/digest-preview?categories=["Newsletter","Receipt","Marketing","Cold Emails"]
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoriesParam = searchParams.get("categories");

    let categories: string[];
    try {
      categories = categoriesParam
        ? JSON.parse(decodeURIComponent(categoriesParam))
        : [];
    } catch {
      return new Response("Invalid categories parameter", { status: 400 });
    }

    const { success, data } = digestPreviewBody.safeParse({
      categories,
    });

    if (!success)
      return new Response("Invalid categories parameter", { status: 400 });

    const digestData = createMockDigestData(data.categories);

    const html = await render(DigestEmail(digestData));

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch {
    return new Response("Error rendering preview", { status: 500 });
  }
}

function createMockDigestData(categories: string[]): DigestEmailProps {
  const digestData: DigestEmailProps = {
    baseUrl: "https://www.getinboxzero.com",
    unsubscribeToken: "preview-token",
    emailAccountId: "preview-account",
    date: new Date(),
  };

  const mockDataTemplates = {
    newsletter: [
      {
        from: "Morning Brew",
        subject: "🔥 Today's top business stories",
        content:
          "Apple unveils Vision Pro 2 with 40% lighter design and $2,499 price tag",
      },
      {
        from: "The New York Times",
        subject: "Breaking News: Latest developments",
        content:
          "Fed signals potential rate cuts as inflation shows signs of cooling to 3.2%",
      },
    ],
    receipt: [
      {
        from: "Amazon",
        subject: "Order #123-4567890-1234567",
        content: "Your order has been delivered to your doorstep.",
      },
      {
        from: "Uber Eats",
        subject: "Your food is on the way!",
        content: "Estimated delivery: 15-20 minutes",
      },
    ],
    marketing: [
      {
        from: "Spotify",
        subject: "Limited offer: 3 months premium for $0.99",
        content: "Upgrade your music experience with this exclusive deal",
      },
      {
        from: "Nike",
        subject: "JUST IN: New Summer Collection 🔥",
        content: "Be the first to shop our latest styles before they sell out",
      },
    ],
    calendar: [
      {
        from: "Sarah Johnson",
        subject: "Team Weekly Sync",
        content:
          "Title: Team Weekly Sync\nDate: Tomorrow, 10:00 AM - 11:00 AM • Meeting Room 3 / Zoom",
      },
    ],
    notification: [
      {
        from: "LinkedIn",
        subject: "New connection request from Sarah M.",
        content: "Sarah M. wants to connect with you on LinkedIn.",
      },
    ],
    toReply: [
      {
        from: "John Smith",
        subject: "Re: Project proposal feedback",
        content: "Received: Yesterday, 4:30 PM • Due: Today",
      },
    ],
    coldEmail: [
      {
        from: "David Williams",
        subject: "Partnership opportunity for your business",
        content: "Growth Solutions Inc.",
      },
      {
        from: "Jennifer Lee",
        subject: "Request for a quick call this week",
        content: "Venture Capital Partners",
      },
    ],
  };

  for (const category of categories) {
    // Handle special case for Cold Emails
    if (category === "Cold Emails") {
      digestData.coldEmail = mockDataTemplates.coldEmail;
    } else {
      // Try to map rule name to a mock data category
      const mappedCategory = mapRuleNameToCategory(category);

      if (mockDataTemplates[mappedCategory as keyof typeof mockDataTemplates]) {
        digestData[mappedCategory] =
          mockDataTemplates[mappedCategory as keyof typeof mockDataTemplates];
      } else {
        // For custom rules, show generic rule-matched content
        digestData[category] = [
          {
            from: "Example Sender",
            subject: `Email matched by "${category}" rule`,
            content:
              "This is an example of content that would be captured by this rule.",
          },
          {
            from: "Another Sender",
            subject: `Another email for "${category}"`,
            content:
              "This shows what a second email matching this rule might look like.",
          },
        ];
      }
    }
  }

  return digestData;
}

function mapRuleNameToCategory(ruleName: string): string {
  const lowerName = ruleName.toLowerCase();

  // Direct matches for common rule names
  if (lowerName === "newsletter" || lowerName === "newsletters")
    return "newsletter";
  if (lowerName === "receipt" || lowerName === "receipts") return "receipt";
  if (lowerName === "marketing") return "marketing";
  if (lowerName === "calendar" || lowerName === "meetings") return "calendar";
  if (lowerName === "notification" || lowerName === "notifications")
    return "notification";
  if (lowerName === "to reply" || lowerName === "toreply") return "toReply";

  // Partial matches for rule names containing keywords
  if (lowerName.includes("newsletter") || lowerName.includes("news"))
    return "newsletter";
  if (
    lowerName.includes("receipt") ||
    lowerName.includes("order") ||
    lowerName.includes("purchase")
  )
    return "receipt";
  if (
    lowerName.includes("marketing") ||
    lowerName.includes("promo") ||
    lowerName.includes("deal")
  )
    return "marketing";
  if (
    lowerName.includes("calendar") ||
    lowerName.includes("meeting") ||
    lowerName.includes("event")
  )
    return "calendar";
  if (lowerName.includes("notification") || lowerName.includes("alert"))
    return "notification";
  if (lowerName.includes("reply") || lowerName.includes("response"))
    return "toReply";

  // Return the original name if no mapping found (will trigger custom rule display)

  return ruleName;
}
