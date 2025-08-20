import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type DigestItem = {
  from: string;
  subject: string;
  content?: string | null | undefined;
};

const colorClasses = {
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border:
      "border-l-blue-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-blue-100",
  },
  green: {
    bg: "bg-green-50",
    text: "text-green-800",
    border:
      "border-l-green-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-green-100",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-800",
    border:
      "border-l-purple-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-purple-100",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border:
      "border-l-amber-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-amber-100",
  },
  gray: {
    bg: "bg-gray-50",
    text: "text-gray-800",
    border:
      "border-l-gray-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-gray-100",
  },
  pink: {
    bg: "bg-pink-50",
    text: "text-pink-800",
    border:
      "border-l-pink-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-pink-100",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-800",
    border:
      "border-l-red-400 border-t-gray-200 border-r-gray-200 border-b-gray-200",
    bgAccent: "bg-red-100",
  },
} as const;

export type DigestEmailProps = {
  baseUrl: string;
  unsubscribeToken: string;
  date?: Date;
  ruleNames?: Record<string, string>;
  [key: string]:
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

  const availableCategories = {
    newsletter: {
      name: "Newsletter",
      emoji: "📰",
      color: "blue",
      href: "#newsletters",
    },
    receipt: {
      name: "Receipt",
      emoji: "🧾",
      color: "green",
      href: "#receipts",
    },
    marketing: {
      name: "Marketing",
      emoji: "🔊",
      color: "purple",
      href: "#marketing",
    },
    calendar: {
      name: "Calendar",
      emoji: "📅",
      color: "amber",
      href: "#calendar",
    },
    coldEmail: {
      name: "Cold Email",
      emoji: "🧊",
      color: "gray",
      href: "#cold-emails",
    },
    notification: {
      name: "Notification",
      emoji: "🔔",
      color: "pink",
      href: "#notifications",
    },
    toReply: {
      name: "To Reply",
      emoji: "⏰",
      color: "red",
      href: "#to-reply",
    },
  };

  const getCategoryInfo = (key: string) => {
    const displayName = ruleNames?.[key] || key;
    if (key in availableCategories) {
      const categoryInfo =
        availableCategories[key as keyof typeof availableCategories];
      return {
        ...categoryInfo,
        name: displayName,
      };
    }

    // Fallback for unknown categories
    return {
      name: displayName,
      emoji: "📂",
      color: "gray",
      href: `#${key}`,
    };
  };

  const getCategoriesWithItemsCount = () => {
    return Object.keys(digestData).filter(
      (key) =>
        Array.isArray(digestData[key]) && (digestData[key]?.length ?? 0) > 0,
    ).length;
  };

  /**
   * Renders a grid of categories with a count of the number of emails in each category.
   * This is needed because we have a total of 7 categories that can be displayed varying from 2 to 7.
   * The grid is rendered differently depending on the number of categories.
   *
   * 2 categories: single row
   * 3-4 categories: 2x2 grid
   * 5-7 categories: 2x2 grid + bottom row
   *
   * @returns Renders a grid of categories with a count of the number of emails in each category.
   */
  const renderCategoryGrid = () => {
    // Get all present categories in digestData
    const categories = Object.keys(digestData)
      .filter(
        (key) =>
          Array.isArray(digestData[key]) && (digestData[key]?.length ?? 0) > 0,
      )
      .map((key) => {
        const items = digestData[key] as DigestItem[];
        const info = getCategoryInfo(key);
        return {
          key,
          ...info,
          count: items.length,
        };
      });

    const categoryCount = categories.length;
    if (categoryCount === 0) return null;

    // For all cases: ensure max 2 items per row
    const rows = [];
    const totalRows = Math.ceil(categoryCount / 2);

    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      const startIndex = rowIndex * 2;
      const endIndex = Math.min(startIndex + 2, categoryCount);
      const isLastRow = rowIndex === totalRows - 1;
      const itemsInThisRow = endIndex - startIndex;

      rows.push(
        <Row key={rowIndex} className={isLastRow ? "mb-[0px]" : "mb-[6px]"}>
          {categories.slice(startIndex, endIndex).map((category, index) => (
            <Column
              key={category.key}
              className={`w-[50%] ${
                itemsInThisRow === 1
                  ? ""
                  : index === 0
                    ? "pr-[4px]"
                    : "pl-[4px]"
              }`}
            >
              <Link href={category.href} className="no-underline">
                <div
                  className={`${colorClasses[category.color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px]`}
                >
                  <Row>
                    <Column
                      style={{ textAlign: "left", verticalAlign: "middle" }}
                    >
                      <Text
                        className={`text-[13px] font-medium ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                      >
                        {category.emoji} {category.name}
                      </Text>
                    </Column>
                    <Column
                      style={{ textAlign: "right", verticalAlign: "middle" }}
                    >
                      <div
                        className={`${colorClasses[category.color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] rounded-[12px]`}
                        style={{ display: "inline-block" }}
                      >
                        <Text
                          className={`text-[12px] font-bold ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                        >
                          {category.count}
                        </Text>
                      </div>
                    </Column>
                  </Row>
                </div>
              </Link>
            </Column>
          ))}
        </Row>,
      );
    }

    return rows;
  };

  // Return early if no digest items are found
  const hasItems = Object.keys(digestData).some(
    (key) =>
      Array.isArray(digestData[key]) && (digestData[key]?.length ?? 0) > 0,
  );

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
    items,
  }: {
    categoryKey: string;
    items: DigestItem[];
  }) => {
    if (items.length === 0) return null;
    const category = getCategoryInfo(categoryKey);
    const colors =
      colorClasses[category.color as keyof typeof colorClasses] ||
      colorClasses.gray;
    return (
      <Section className="mb-[40px]" id={category.href.slice(1)}>
        <div className="mb-[20px]">
          <div className="flex items-center mb-[20px]">
            <Heading className="text-[20px] font-bold text-gray-900 mt-0 mb-0 mr-[12px]">
              {category.emoji} {category.name}
            </Heading>
            <div
              className={`${colors.bgAccent} text-[12px] font-medium px-[8px] py-[4px] rounded-[12px]`}
            >
              {items.length} emails
            </div>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              className={`mb-[12px] p-[20px] border-l-[4px] border-t-[1px] border-r-[1px] border-b-[1px] border-solid ${colors.border} bg-[#fdfefe] rounded-[8px]`}
            >
              {/* Email Header */}
              <div className="mb-[12px]">
                <Text className="text-[16px] font-bold text-gray-900 mt-0 mb-0">
                  {item.subject}
                </Text>
                <Text className="text-[14px] text-gray-700 mt-[2px] mb-0">
                  From:{" "}
                  <span className="font-medium text-gray-800">{item.from}</span>
                </Text>
              </div>

              {/* Email Content */}
              {renderEmailContent(item)}
            </div>
          ))}
        </div>
      </Section>
    );
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

            {getCategoriesWithItemsCount() > 1 && (
              <Section className="mb-[24px]">{renderCategoryGrid()}</Section>
            )}
            {Object.keys(digestData).map((categoryKey) =>
              Array.isArray(digestData[categoryKey]) &&
              digestData[categoryKey]?.length > 0 ? (
                <CategorySection
                  key={categoryKey}
                  categoryKey={categoryKey}
                  items={digestData[categoryKey] as DigestItem[]}
                />
              ) : null,
            )}
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
  ],
  receipt: [
    {
      from: "Amazon",
      subject: "Order #112-3456789-0123456",
      content: "Merchant: Amazon\nAmount: $42.99\nDate: 9:15 AM",
    },
    {
      from: "Uber Eats",
      subject: "Order #EAT-123456789",
      content: "Merchant: Uber Eats\nAmount: $23.45\nDate: 1:20 PM",
    },
    {
      from: "Netflix",
      subject: "Monthly subscription",
      content: "Merchant: Netflix\nAmount: $15.99\nDate: 4:30 AM",
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
      subject: "Profile Views",
      content:
        "Title: Profile Views\nDate: 5 people viewed your profile this week • 11:00 AM",
    },
    {
      from: "Slack",
      subject: "Unread Messages",
      content:
        "Title: Unread Messages\nDate: 3 unread messages in #general channel • 2:45 PM",
    },
    {
      from: "GitHub",
      subject: "Pull Request Update",
      content:
        "Title: Pull Request Update\nDate: Pull request #123 was approved • 5:30 PM",
    },
    {
      from: "Twitter",
      subject: "New Followers",
      content: "Title: New Followers\nDate: You have 7 new followers • 6:15 PM",
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
      subject: "Area Man Unsure If He’s Living In Simulation Or Just Milwaukee",
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
      <Text className="m-0">
        <Link
          href={`${baseUrl}/api/unsubscribe?token=${unsubscribeToken}`}
          className="text-gray-500 underline"
        >
          Unsubscribe
        </Link>
      </Text>
    </Section>
  );
}
