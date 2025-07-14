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

type DigestEntry = {
  label: string;
  value: string;
};

type DigestContent = {
  entries?: DigestEntry[] | undefined | null;
  summary?: string | undefined | null;
};

type DigestItem = {
  from: string;
  subject: string;
  content?: DigestContent | null | undefined;
};

const colorClasses = {
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    bgAccent: "bg-blue-100",
  },
  green: {
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-200",
    bgAccent: "bg-green-100",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-800",
    border: "border-purple-200",
    bgAccent: "bg-purple-100",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    bgAccent: "bg-amber-100",
  },
  gray: {
    bg: "bg-gray-50",
    text: "text-gray-800",
    border: "border-gray-200",
    bgAccent: "bg-gray-100",
  },
  pink: {
    bg: "bg-pink-50",
    text: "text-pink-800",
    border: "border-pink-200",
    bgAccent: "bg-pink-100",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    bgAccent: "bg-red-100",
  },
} as const;

export interface DigestEmailProps {
  baseUrl: string;
  unsubscribeToken: string;
  date?: Date;
  newsletter?: DigestItem[] | undefined;
  receipt?: DigestItem[] | undefined;
  marketing?: DigestItem[] | undefined;
  calendar?: DigestItem[] | undefined;
  coldEmail?: DigestItem[] | undefined;
  notification?: DigestItem[] | undefined;
  toReply?: DigestItem[] | undefined;
}

export default function DigestEmail(props: DigestEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    newsletter = [],
    receipt = [],
    marketing = [],
    calendar = [],
    coldEmail = [],
    notification = [],
    toReply = [],
    unsubscribeToken,
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

  const getCategoryInfo = (key: keyof typeof availableCategories) => {
    return availableCategories[key];
  };

  const getCategoriesWithItemsCount = () => {
    return Object.entries(availableCategories).filter(
      ([key]) =>
        Array.isArray(props[key as keyof DigestEmailProps]) &&
        (props[key as keyof DigestEmailProps] as unknown as any[])?.length > 0,
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
    const categories = Object.entries(availableCategories)
      .map(([key, value]) => ({
        key,
        ...value,
        count: Array.isArray(props[key as keyof DigestEmailProps])
          ? (props[key as keyof DigestEmailProps] as unknown as any[])
              ?.length || 0
          : 0,
      }))
      .filter((cat) => cat.count > 0);

    const categoryCount = categories.length;

    if (categoryCount <= 1) return null;

    // For 2 categories: single row
    if (categoryCount === 2) {
      return (
        <Row className="mb-[0px]">
          {categories.map((category, index) => (
            <Column
              key={category.key}
              className={`w-[50%] ${index === 0 ? "pr-[4px]" : "pl-[4px]"}`}
            >
              <Link href={category.href} className="no-underline">
                <div
                  className={`${colorClasses[category.color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
                >
                  <Text
                    className={`text-[13px] font-medium ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                  >
                    {category.emoji} {category.name}
                  </Text>
                  <div
                    className={`${colorClasses[category.color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] ml-[8px] rounded-[12px]`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                    >
                      {category.count}
                    </Text>
                  </div>
                </div>
              </Link>
            </Column>
          ))}
        </Row>
      );
    }

    // For 3-4 categories: 2x2 grid
    if (categoryCount <= 4) {
      const rows = [];
      for (let i = 0; i < categoryCount; i += 2) {
        const isLastRow = i + 2 >= categoryCount;
        rows.push(
          <Row key={i} className={isLastRow ? "mb-[0px]" : "mb-[6px]"}>
            <Column className="w-[50%] pr-[4px]">
              <Link href={categories[i].href} className="no-underline">
                <div
                  className={`${colorClasses[categories[i].color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
                >
                  <Text
                    className={`text-[13px] font-medium ${colorClasses[categories[i].color as keyof typeof colorClasses].text} m-0`}
                  >
                    {categories[i].emoji} {categories[i].name}
                  </Text>
                  <div
                    className={`${colorClasses[categories[i].color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] ml-[8px] rounded-[12px]`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${colorClasses[categories[i].color as keyof typeof colorClasses].text} m-0`}
                    >
                      {categories[i].count}
                    </Text>
                  </div>
                </div>
              </Link>
            </Column>
            {i + 1 < categoryCount && (
              <Column className="w-[50%] pl-[4px]">
                <Link href={categories[i + 1].href} className="no-underline">
                  <div
                    className={`${colorClasses[categories[i + 1].color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${colorClasses[categories[i + 1].color as keyof typeof colorClasses].text} m-0`}
                    >
                      {categories[i + 1].emoji} {categories[i + 1].name}
                    </Text>
                    <div
                      className={`${colorClasses[categories[i + 1].color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] ml-[8px] rounded-[12px]`}
                    >
                      <Text
                        className={`text-[12px] font-bold ${colorClasses[categories[i + 1].color as keyof typeof colorClasses].text} m-0`}
                      >
                        {categories[i + 1].count}
                      </Text>
                    </div>
                  </div>
                </Link>
              </Column>
            )}
          </Row>,
        );
      }
      return rows;
    }

    // For 5-7 categories: 2x2 grid + bottom row
    const rows = [];
    // First two rows (4 categories)
    for (let i = 0; i < 4; i += 2) {
      rows.push(
        <Row key={i} className="mb-[6px]">
          <Column className="w-[50%] pr-[4px]">
            <Link href={categories[i].href} className="no-underline">
              <div
                className={`${colorClasses[categories[i].color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
              >
                <Text
                  className={`text-[13px] font-medium ${colorClasses[categories[i].color as keyof typeof colorClasses].text} m-0`}
                >
                  {categories[i].emoji} {categories[i].name}
                </Text>
                <div
                  className={`${colorClasses[categories[i].color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] ml-[8px] rounded-[12px]`}
                >
                  <Text
                    className={`text-[12px] font-bold ${colorClasses[categories[i].color as keyof typeof colorClasses].text} m-0`}
                  >
                    {categories[i].count}
                  </Text>
                </div>
              </div>
            </Link>
          </Column>
          <Column className="w-[50%] pl-[4px]">
            <Link href={categories[i + 1].href} className="no-underline">
              <div
                className={`${colorClasses[categories[i + 1].color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
              >
                <Text
                  className={`text-[13px] font-medium ${colorClasses[categories[i + 1].color as keyof typeof colorClasses].text} m-0`}
                >
                  {categories[i + 1].emoji} {categories[i + 1].name}
                </Text>
                <div
                  className={`${colorClasses[categories[i + 1].color as keyof typeof colorClasses].bgAccent} px-[8px] py-[2px] ml-[8px] rounded-[12px]`}
                >
                  <Text
                    className={`text-[12px] font-bold ${colorClasses[categories[i + 1].color as keyof typeof colorClasses].text} m-0`}
                  >
                    {categories[i + 1].count}
                  </Text>
                </div>
              </div>
            </Link>
          </Column>
        </Row>,
      );
    }

    // Bottom row for remaining categories
    const remainingCategories = categories.slice(4);
    const remainingCount = remainingCategories.length;

    if (remainingCount > 0) {
      const widthClass =
        remainingCount === 1
          ? "w-[100%]"
          : remainingCount === 2
            ? "w-[50%]"
            : "w-[33.33%]";

      rows.push(
        <Row key="bottom" className="mb-[0px]">
          {remainingCategories.map((category, index) => (
            <Column
              key={category.key}
              className={`${widthClass} ${
                remainingCount === 1
                  ? ""
                  : remainingCount === 2
                    ? index === 0
                      ? "pr-[4px]"
                      : "pl-[4px]"
                    : index === 0
                      ? "pr-[4px]"
                      : index === remainingCount - 1
                        ? "pl-[4px]"
                        : "px-[2px]"
              }`}
            >
              <Link href={category.href} className="no-underline">
                <div
                  className={`${colorClasses[category.color as keyof typeof colorClasses].bg} p-[8px] rounded-[4px] flex justify-between items-center`}
                >
                  <Text
                    className={`text-[13px] font-medium ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                  >
                    {category.emoji} {category.name}
                  </Text>
                  <div
                    className={`${colorClasses[category.color as keyof typeof colorClasses].bgAccent} px-[8px] py-[0px] ml-[4px] rounded-[12px]`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${colorClasses[category.color as keyof typeof colorClasses].text} m-0`}
                    >
                      {category.count}
                    </Text>
                  </div>
                </div>
              </Link>
            </Column>
          ))}
        </Row>,
      );
    }

    return rows;
  };

  const CategorySection = ({
    categoryKey,
    items,
  }: {
    categoryKey: keyof typeof availableCategories;
    items: DigestItem[];
  }) => {
    if (items.length === 0) return null;

    const category = getCategoryInfo(categoryKey);
    const colors = colorClasses[category.color as keyof typeof colorClasses];

    return (
      <Section className="mb-[20px]" id={category.href.slice(1)}>
        <div className={`${colors.bg} rounded-[6px] p-[12px]`}>
          <Heading
            className={`text-[16px] font-bold ${colors.text} mt-[0px] mb-[12px]`}
          >
            {category.emoji} {category.name} ({items.length})
          </Heading>

          {items.map((item, index) => (
            <div
              key={index}
              className={`mb-[8px] bg-white rounded-[6px] p-[10px] border-solid border-[1px] ${colors.border}`}
            >
              <Text className="text-[14px] font-bold text-gray-800 m-0">
                {item.subject}
              </Text>
              <Text className="text-[12px] text-gray-800 mt-[1px] mb-[10px] leading-[15px]">
                {item.from}
              </Text>
              {item.content &&
              Array.isArray(item.content.entries) &&
              item.content.entries.length > 0 ? (
                <Section className="mt-3 rounded-lg bg-white/50 p-0 text-left">
                  {item.content.entries.map((entry, idx) => (
                    <Row key={idx} className="mb-0 p-0">
                      <Column>
                        <Text className="m-0 text-gray-800 text-[14px] leading-[21px]">
                          {entry.label}
                        </Text>
                      </Column>
                      <Column align="right">
                        <Text className="m-0 font-semibold text-gray-700 text-[14px] leading-[21px]">
                          {entry.value}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              ) : (
                <Text className="text-[14px] text-gray-500 mt-[2px] m-0 leading-[21px]">
                  {item.content?.summary}
                </Text>
              )}
            </div>
          ))}
        </div>
      </Section>
    );
  };

  // Return early if no digest items are found
  const hasItems =
    newsletter.length > 0 ||
    receipt.length > 0 ||
    marketing.length > 0 ||
    calendar.length > 0 ||
    coldEmail.length > 0 ||
    notification.length > 0 ||
    toReply.length > 0;

  if (!hasItems) {
    return null;
  }

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

            <CategorySection categoryKey="newsletter" items={newsletter} />
            <CategorySection categoryKey="receipt" items={receipt} />
            <CategorySection categoryKey="marketing" items={marketing} />
            <CategorySection categoryKey="calendar" items={calendar} />
            <CategorySection categoryKey="coldEmail" items={coldEmail} />
            <CategorySection categoryKey="notification" items={notification} />
            <CategorySection categoryKey="toReply" items={toReply} />

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
  newsletter: [
    {
      from: "Morning Brew",
      subject: "🔥 Today's top business stories",
      content: {
        summary:
          "The latest on tech layoffs, market trends, and startup funding rounds...",
      },
    },
    {
      from: "The New York Times",
      subject: "Breaking News: Latest developments",
      content: {
        summary:
          "Stay informed with the latest headlines and analysis from around the world...",
      },
    },
    {
      from: "Product Hunt Daily",
      subject: "🚀 Today's hottest tech products",
      content: {
        summary:
          "Discover the newest apps, websites, and tech products that launched today...",
      },
    },
  ],
  receipt: [
    {
      from: "Amazon",
      subject: "Order #112-3456789-0123456",
      content: {
        entries: [
          { label: "Merchant", value: "Amazon" },
          { label: "Amount", value: "$42.99" },
          { label: "Date", value: "9:15 AM" },
        ],
        summary: "Order total: $42.99 • Time: 9:15 AM",
      },
    },
    {
      from: "Uber Eats",
      subject: "Order #EAT-123456789",
      content: {
        entries: [
          { label: "Merchant", value: "Uber Eats" },
          { label: "Amount", value: "$23.45" },
          { label: "Date", value: "1:20 PM" },
        ],
        summary: "Order total: $23.45 • Time: 1:20 PM",
      },
    },
    {
      from: "Netflix",
      subject: "Monthly subscription",
      content: {
        entries: [
          { label: "Merchant", value: "Netflix" },
          { label: "Amount", value: "$15.99" },
          { label: "Date", value: "4:30 AM" },
        ],
        summary: "Subscription: $15.99 • Time: 4:30 AM",
      },
    },
  ],
  marketing: [
    {
      from: "Spotify",
      subject: "Limited offer: 3 months premium for $0.99",
      content: {
        summary: "Upgrade your music experience with this exclusive deal",
      },
    },
    {
      from: "Nike",
      subject: "JUST IN: New Summer Collection 🔥",
      content: {
        summary: "Be the first to shop our latest styles before they sell out",
      },
    },
    {
      from: "Airbnb",
      subject: "Weekend getaway ideas near you",
      content: {
        summary:
          "Discover unique stays within a 2-hour drive from your location",
      },
    },
  ],
  calendar: [
    {
      from: "Sarah Johnson",
      subject: "Team Weekly Sync",
      content: {
        entries: [
          { label: "Title", value: "Team Weekly Sync" },
          {
            label: "Date",
            value: "Tomorrow, 10:00 AM - 11:00 AM • Meeting Room 3 / Zoom",
          },
        ],
        summary: "Tomorrow, 10:00 AM - 11:00 AM • Meeting Room 3 / Zoom",
      },
    },
    {
      from: "Michael Chen",
      subject: "Quarterly Review",
      content: {
        entries: [
          { label: "Title", value: "Quarterly Review" },
          {
            label: "Date",
            value: "Friday, May 26, 2:00 PM - 4:00 PM • Conference Room A",
          },
        ],
        summary: "Friday, May 26, 2:00 PM - 4:00 PM • Conference Room A",
      },
    },
    {
      from: "Personal Calendar",
      subject: "Dentist Appointment",
      content: {
        entries: [
          { label: "Title", value: "Dentist Appointment" },
          {
            label: "Date",
            value: "Monday, May 29, 9:30 AM • Downtown Dental Clinic",
          },
        ],
        summary: "Monday, May 29, 9:30 AM • Downtown Dental Clinic",
      },
    },
  ],
  coldEmail: [
    {
      from: "David Williams",
      subject: "Partnership opportunity for your business",
      content: {
        summary: "Growth Solutions Inc.",
      },
    },
    {
      from: "Jennifer Lee",
      subject: "Request for a quick call this week",
      content: {
        summary: "Venture Capital Partners",
      },
    },
    {
      from: "Robert Taylor",
      subject: "Introducing our new B2B solution",
      content: {
        summary: "Enterprise Tech Solutions",
      },
    },
  ],
  notification: [
    {
      from: "LinkedIn",
      subject: "Profile Views",
      content: {
        entries: [
          { label: "Title", value: "Profile Views" },
          {
            label: "Date",
            value: "5 people viewed your profile this week • 11:00 AM",
          },
        ],
        summary: "5 people viewed your profile this week • 11:00 AM",
      },
    },
    {
      from: "Slack",
      subject: "Unread Messages",
      content: {
        entries: [
          { label: "Title", value: "Unread Messages" },
          {
            label: "Date",
            value: "3 unread messages in #general channel • 2:45 PM",
          },
        ],
        summary: "3 unread messages in #general channel • 2:45 PM",
      },
    },
    {
      from: "GitHub",
      subject: "Pull Request Update",
      content: {
        entries: [
          { label: "Title", value: "Pull Request Update" },
          { label: "Date", value: "Pull request #123 was approved • 5:30 PM" },
        ],
        summary: "Pull request #123 was approved • 5:30 PM",
      },
    },
    {
      from: "Twitter",
      subject: "New Followers",
      content: {
        entries: [
          { label: "Title", value: "New Followers" },
          { label: "Date", value: "You have 7 new followers • 6:15 PM" },
        ],
        summary: "You have 7 new followers • 6:15 PM",
      },
    },
  ],
  toReply: [
    {
      from: "John Smith",
      subject: "Re: Project proposal feedback",
      content: {
        summary: "Received: Yesterday, 4:30 PM • Due: Today",
      },
    },
    {
      from: "Client XYZ",
      subject: "Questions about the latest deliverable",
      content: {
        summary: "Received: Monday, 10:15 AM • Due: Tomorrow",
      },
    },
    {
      from: "HR Department",
      subject: "Annual review scheduling",
      content: {
        summary: "Received: Tuesday, 9:00 AM • Due: Friday",
      },
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
