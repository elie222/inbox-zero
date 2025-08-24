import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import pluralize from "pluralize";

type DigestItem = {
  from: string;
  subject: string;
  content?: string | null | undefined;
};

const colorClasses = {
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    leftBorder: "border-l-blue-400",
    bgAccent: "bg-blue-100",
  },
  green: {
    bg: "bg-green-50",
    text: "text-green-800",
    leftBorder: "border-l-green-400",
    bgAccent: "bg-green-100",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-800",
    leftBorder: "border-l-purple-400",
    bgAccent: "bg-purple-100",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    leftBorder: "border-l-amber-400",
    bgAccent: "bg-amber-100",
  },
  gray: {
    bg: "bg-gray-50",
    text: "text-gray-800",
    leftBorder: "border-l-gray-400",
    bgAccent: "bg-gray-100",
  },
  pink: {
    bg: "bg-pink-50",
    text: "text-pink-800",
    leftBorder: "border-l-pink-400",
    bgAccent: "bg-pink-100",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-800",
    leftBorder: "border-l-red-400",
    bgAccent: "bg-red-100",
  },
} as const;

type NormalizedCategoryData = {
  count: number;
  senders: string[];
  items: DigestItem[];
};

export type DigestEmailProps = {
  baseUrl: string;
  unsubscribeToken: string;
  date?: Date;
  ruleNames?: Record<string, string>;
  [key: string]:
    | NormalizedCategoryData
    | DigestItem[]
    | undefined
    | string
    | Date
    | Record<string, string>
    | undefined;
};

export default function DigestEmail(props: DigestEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    unsubscribeToken,
    ruleNames,
    ...digestData
  } = props;

  const categoryColors: Record<string, keyof typeof colorClasses> = {
    newsletter: "blue",
    receipt: "green",
    marketing: "purple",
    calendar: "amber",
    coldEmail: "gray",
    notification: "pink",
    toReply: "red",
  };

  const normalizeCategoryData = (
    _key: string,
    data:
      | DigestItem[]
      | NormalizedCategoryData
      | string
      | Date
      | Record<string, string>
      | undefined,
  ): NormalizedCategoryData | null => {
    if (Array.isArray(data)) {
      const items = data;
      const senders = Array.from(new Set(items.map((item) => item.from))).slice(
        0,
        5,
      );
      return {
        count: items.length,
        senders,
        items,
      };
    } else if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      "count" in data &&
      "senders" in data &&
      "items" in data &&
      typeof data.count === "number" &&
      Array.isArray(data.senders) &&
      Array.isArray(data.items)
    ) {
      return data as NormalizedCategoryData;
    }
    return null;
  };

  // Return early if no digest data is found
  const hasItems = Object.keys(digestData).some((key) => {
    const categoryData = normalizeCategoryData(key, digestData[key]);
    return categoryData && categoryData.count > 0;
  });

  if (!hasItems) {
    return null;
  }

  const renderEmailContent = (item: DigestItem) => {
    if (item.content) {
      // Split content by newlines and render each line separately
      const lines = item.content.split("\n").filter((line) => line.trim());

      // If there are multiple lines, render as bullet points
      if (lines.length > 1) {
        return (
          <div>
            <ul className="m-0 pl-[20px]">
              {lines.map((line, index) => (
                <li key={index} className="text-[14px] text-gray-800 mb-[1px]">
                  {line.trim()}
                </li>
              ))}
            </ul>
          </div>
        );
      } else {
        // Single line content
        return (
          <Text className="text-[14px] text-gray-800 mt-[4px] mb-0 leading-[1.5]">
            {item.content}
          </Text>
        );
      }
    }
    return null;
  };

  const CategorySection = ({
    categoryKey,
    categoryData,
  }: {
    categoryKey: string;
    categoryData: NormalizedCategoryData;
  }) => {
    const colors = colorClasses[categoryColors[categoryKey] || "gray"];

    if (categoryData.items.length > 0) {
      return (
        <Section className="mb-[8px]" id={categoryKey}>
          <div className="mb-[8px]">
            <div className="text-left mb-[8px]">
              <div className="px-4 py-3">
                <Text className="text-[16px] text-gray-700 mt-0 mb-0">
                  {categoryData.count}{" "}
                  <span className={`${colors.text} font-semibold`}>
                    {categoryData.count > 1
                      ? pluralize(
                          (
                            ruleNames?.[categoryKey] || categoryKey
                          ).toLowerCase(),
                        )
                      : (ruleNames?.[categoryKey] || categoryKey).toLowerCase()}
                  </span>
                  {" from "}
                  {categoryData.senders.map((sender, index) => {
                    if (index === 0) {
                      return sender;
                    } else {
                      return `, ${sender}`;
                    }
                  })}
                  {categoryData.count > 5 && " and more"}
                </Text>
              </div>
            </div>

            <div
              className={`border-l-[4px] border-t border-r border-b border-solid border-gray-200 ${colors.leftBorder} bg-[#fdfefe] rounded-[8px] overflow-hidden`}
            >
              {categoryData.items.map((item, index) => (
                <div key={index}>
                  <div className="p-[20px]">
                    {/* Email Header */}
                    <div className="mb-[12px]">
                      <Text className="text-[16px] font-bold text-gray-900 mt-0 mb-0">
                        {item.subject}
                      </Text>
                      <Text className="text-[14px] text-gray-700 mt-[2px] mb-0">
                        From:{" "}
                        <span className="font-medium text-gray-800">
                          {item.from}
                        </span>
                      </Text>
                    </div>

                    {/* Email Content */}
                    {renderEmailContent(item)}
                  </div>

                  {/* Separator line - don't show after the last item */}
                  {index < categoryData.items.length - 1 && (
                    <Hr className="border-solid border-gray-200 my-0 mx-[20px]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    } else {
      // Categories with no highlights - much more compact
      return (
        <div className="mb-[4px]" id={categoryKey}>
          <div className="px-4 py-2">
            <Text className="text-[16px] text-gray-700 mt-0 mb-0">
              {categoryData.count}{" "}
              <span className={`${colors.text} font-semibold`}>
                {categoryData.count > 1
                  ? pluralize(
                      (ruleNames?.[categoryKey] || categoryKey).toLowerCase(),
                    )
                  : (ruleNames?.[categoryKey] || categoryKey).toLowerCase()}
              </span>
              {" from "}
              {categoryData.senders.map((sender, index) => {
                if (index === 0) {
                  return sender;
                } else {
                  return `, ${sender}`;
                }
              })}
              {categoryData.count > 5 && " and more"}
            </Text>
          </div>
        </div>
      );
    }
  };

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="p-4 text-center">
              <Link href={baseUrl} className="text-[15px]">
                <Img
                  src={"https://www.getinboxzero.com/icon.png"}
                  width="40"
                  height="40"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>

              <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
                <span className="font-semibold tracking-tighter">
                  Inbox Zero
                </span>
              </Text>

              <Heading className="my-4 text-4xl font-medium leading-tight">
                Your Digest
              </Heading>
              <Text className="mb-8 text-lg leading-8">
                Here's a summary of what's happened in your inbox.
              </Text>
            </Section>

            {Object.keys(digestData).map((categoryKey) => {
              const categoryData = normalizeCategoryData(
                categoryKey,
                digestData[categoryKey],
              );
              if (!categoryData) return null;

              return (
                <CategorySection
                  key={categoryKey}
                  categoryKey={categoryKey}
                  categoryData={categoryData}
                />
              );
            })}
            <Hr className="border-solid border-gray-200 my-[24px]" />
            <Footer baseUrl={baseUrl} unsubscribeToken={unsubscribeToken} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

DigestEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  unsubscribeToken: "123",
  ruleNames: {
    newsletter: "Newsletter",
    receipt: "Receipt",
    marketing: "Marketing",
    calendar: "Calendar",
    coldEmail: "Cold Email",
    notification: "Notification",
    toReply: "To Reply",
    travel: "Travel",
    funnyStuff: "Funny Stuff",
    orders: "Orders",
  },
  newsletter: [
    {
      from: "Morning Brew",
      subject: "🔥 Today's top business stories",
      content:
        "Apple unveils Vision Pro 2 with 40% lighter design and $2,499 price tag\nStripe raises $6.5B at $50B valuation as fintech consolidation continues\nTesla's Cybertruck production hits 1,000 units per week milestone ahead of schedule",
    },
    {
      from: "The New York Times",
      subject: "Breaking News: Latest developments",
      content:
        "Fed signals potential rate cuts as inflation shows signs of cooling to 3.2%\nSupreme Court rules 6-3 on landmark digital privacy case affecting tech giants\nNASA's Artemis mission discovers water ice deposits in lunar south pole crater",
    },
    {
      from: "Product Hunt Daily",
      subject: "🚀 Today's hottest tech products",
      content:
        "Claude Projects: Anthropic's new workspace for organizing AI conversations (847 upvotes)\nScreenFloat: Mac app that keeps any window floating above all others (523 upvotes)\nCursor AI Editor hits #1 with new composer feature for multi-file editing (1,204 upvotes)",
    },
    {
      from: "TechCrunch",
      subject: "Startup funding roundup: Q1 2024",
      content:
        "AI startups raised $12B in Q1, up 45% from last year\nFintech sector sees consolidation with 3 major acquisitions\nEnterprise SaaS continues strong growth trajectory",
    },
    {
      from: "The Verge",
      subject: "CES 2024: The best gadgets and announcements",
      content:
        "Samsung unveils transparent MicroLED displays\nLG's rollable OLED TV gets 8K upgrade\nSony's new VR headset challenges Meta's dominance",
    },
    {
      from: "Ars Technica",
      subject: "SpaceX Starship achieves orbital milestone",
      content:
        "Successful launch and landing of Starship prototype\nNext test flight scheduled for next month\nNASA partnership for lunar missions confirmed",
    },
    {
      from: "Wired",
      subject: "The future of quantum computing",
      content:
        "IBM reaches 1,000+ qubit milestone\nGoogle's quantum supremacy claims verified\nNew algorithms show promise for cryptography",
    },
    {
      from: "MIT Technology Review",
      subject: "Climate tech innovations to watch",
      content:
        "Direct air capture technology breakthrough\nGreen hydrogen production costs drop 60%\nCarbon-neutral cement alternatives emerge",
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
      content:
        "Estimated delivery: 15-20 minutes\nDriver: John D.\nOrder total: $24.50",
    },
    {
      from: "Netflix",
      subject: "Payment received for Netflix subscription",
      content: "Amount: $15.99\nNext billing date: March 15, 2024",
    },
    {
      from: "Spotify",
      subject: "Premium subscription renewed",
      content:
        "Your Spotify Premium subscription has been renewed for $9.99/month.",
    },
    {
      from: "Apple",
      subject: "iCloud storage payment",
      content: "iCloud+ 50GB plan renewed for $0.99/month.",
    },
    {
      from: "Starbucks",
      subject: "Receipt for your purchase",
      content:
        "Location: Downtown Store\nItems: 2x Venti Lattes, 1x Croissant\nTotal: $18.75\nPayment: Apple Pay",
    },
    {
      from: "Target",
      subject: "Order confirmation #TGT-789456",
      content:
        "Order total: $67.89\nItems: 5 items\nEstimated delivery: Tomorrow\nTracking: UPS 1Z999AA1234567890",
    },
    {
      from: "DoorDash",
      subject: "Your delivery is complete",
      content:
        "Restaurant: Thai Palace\nOrder: Pad Thai, Spring Rolls, Thai Iced Tea\nTotal: $32.45\nTip: $5.00",
    },
    {
      from: "Walmart",
      subject: "Online order shipped",
      content:
        "Order #WM-456789\nItems: 3 items\nTotal: $89.99\nCarrier: FedEx\nTracking: 123456789012",
    },
    {
      from: "Costco",
      subject: "Monthly membership renewal",
      content:
        "Executive Membership renewed\nAnnual fee: $120.00\nNext renewal: March 15, 2025\nBenefits: 2% cashback, travel discounts",
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
    {
      from: "Airbnb",
      subject: "Weekend getaway ideas near you",
      content: "Discover unique stays within a 2-hour drive from your location",
    },
  ],
  calendar: [
    {
      from: "Sarah Johnson",
      subject: "Team Weekly Sync",
      content:
        "Title: Team Weekly Sync\nDate: Tomorrow, 10:00 AM - 11:00 AM • Meeting Room 3 / Zoom",
    },
    {
      from: "Michael Chen",
      subject: "Quarterly Review",
      content:
        "Title: Quarterly Review\nDate: Friday, May 26, 2:00 PM - 4:00 PM • Conference Room A",
    },
    {
      from: "Personal Calendar",
      subject: "Dentist Appointment",
      content:
        "Title: Dentist Appointment\nDate: Monday, May 29, 9:30 AM • Downtown Dental Clinic",
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
    {
      from: "Robert Taylor",
      subject: "Introducing our new B2B solution",
      content: "Enterprise Tech Solutions",
    },
  ],
  notification: [
    {
      from: "LinkedIn",
      subject: "New connection request from Sarah M.",
      content: "Sarah M. wants to connect with you on LinkedIn.",
    },
    {
      from: "Slack",
      subject: "New message in #general",
      content: "Alex: Can someone help me with the deployment?",
    },
    {
      from: "GitHub",
      subject: "Pull request #1234 needs your review",
      content:
        "Repository: myapp\nBranch: feature/new-feature\nFiles changed: 15",
    },
    {
      from: "Twitter",
      subject: "New follower: @techguru",
      content: "You have a new follower on Twitter.",
    },
    {
      from: "Discord",
      subject: "New message in #development",
      content: "Mike: The new API endpoint is working great!",
    },
  ],
  toReply: [
    {
      from: "John Smith",
      subject: "Re: Project proposal feedback",
      content: "Received: Yesterday, 4:30 PM • Due: Today",
    },
    {
      from: "Client XYZ",
      subject: "Questions about the latest deliverable",
      content: "Received: Monday, 10:15 AM • Due: Tomorrow",
    },
    {
      from: "HR Department",
      subject: "Annual review scheduling",
      content: "Received: Tuesday, 9:00 AM • Due: Friday",
    },
  ],
  // --- Custom categories for testing ---
  travel: [
    {
      from: "Expedia",
      subject: "Your flight to Paris is booked!",
      content: "Flight departs July 10th at 7:00 PM. Confirmation #ABC123.",
    },
    {
      from: "Airbnb",
      subject: "Upcoming stay in Montmartre",
      content: "Check-in: July 11th, Check-out: July 18th. Host: Marie.",
    },
  ],
  funnyStuff: [
    {
      from: "The Onion",
      subject: "Area Man Unsure If He's Living In Simulation Or Just Milwaukee",
      content:
        "Local man questions reality after seeing three people in cheese hats.",
    },
    {
      from: "Reddit",
      subject: "Top meme of the day",
      content: "A cat wearing sunglasses and riding a Roomba.",
    },
  ],
  orders: [
    {
      from: "Shopify",
      subject: "Order #SHOP-2024-001",
      content:
        "Order ID: SHOP-2024-001\nTotal: $89.99\nStatus: Shipped\nTracking: 1Z999AA1234567890",
    },
    {
      from: "Etsy",
      subject: "Your handmade jewelry order",
      content:
        "Seller: HandmadeCrafts\nItem: Sterling Silver Necklace\nPrice: $45.00\nEstimated Delivery: March 15-20",
    },
    {
      from: "Amazon",
      subject: "Order #114-1234567-8901234",
      content:
        "Order Number: 114-1234567-8901234\nItems: 3 items\nTotal: $156.78\nDelivery: Tomorrow by 8 PM",
    },
  ],
};

function Footer({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section className="mt-8 text-center text-sm text-gray-500">
      <Text className="m-0">
        You're receiving this email because you enabled digest emails in your
        Inbox Zero settings.
      </Text>
      <div className="flex justify-center items-center gap-[16px] mt-[8px]">
        <Link
          href={`${baseUrl}/api/unsubscribe?token=${unsubscribeToken}`}
          className="text-gray-500 underline"
        >
          Unsubscribe
        </Link>
        <Link href={`${baseUrl}/settings`} className="text-gray-500 underline">
          Customize what you receive
        </Link>
      </div>
    </Section>
  );
}
