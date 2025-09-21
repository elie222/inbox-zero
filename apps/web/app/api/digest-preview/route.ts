import type { NextRequest } from "next/server";
import { render } from "@react-email/render";
import DigestEmail, {
  type DigestEmailProps,
} from "@inboxzero/resend/emails/digest";
import { digestPreviewBody } from "@/app/api/digest-preview/validation";

// http://localhost:3000/api/digest-preview?categories=newsletter,receipt,marketing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoriesParam = searchParams.get("categories");

    const { success, data } = digestPreviewBody.safeParse({
      categories: categoriesParam,
    });

    if (!success)
      return new Response("Invalid categories parameter", { status: 400 });

    const digestData = createMockDigestData(data.categories);

    const html = await render(DigestEmail(digestData));

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digest Preview</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            background-color: #f8fafc;
        }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;

    return new Response(fullHtml, {
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
    if (category === "cold-emails") {
      digestData.coldEmail = mockDataTemplates.coldEmail;
    } else if (mockDataTemplates[category as keyof typeof mockDataTemplates]) {
      digestData[category] =
        mockDataTemplates[category as keyof typeof mockDataTemplates];
    } else {
      // Fallback for rule IDs (which come from the form) - show generic rule-based emails
      const ruleName = `Rule ${category.slice(-4)}`; // Use last 4 chars for display
      digestData[category] = [
        {
          from: "John Smith",
          subject: "Project update - Q4 planning",
          content: `Email matched by ${ruleName}: Hi team, here's the latest update on our Q4 planning initiatives...`,
        },
        {
          from: "Sarah Johnson",
          subject: "Meeting follow-up",
          content: `Email matched by ${ruleName}: Thanks for the productive discussion today. Here are the action items...`,
        },
      ];
    }
  }

  return digestData;
}
