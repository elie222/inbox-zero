import {
  RocketIcon,
  BriefcaseIcon,
  StoreIcon,
  CodeIcon,
  CalendarDaysIcon,
  TrendingUpIcon,
  PhoneIcon,
  MegaphoneIcon,
  HeadphonesIcon,
  HomeIcon,
  VideoIcon,
  UsersIcon,
  ShoppingCartIcon,
  GraduationCapIcon,
  UserIcon,
  CircleHelpIcon,
  type LucideIcon,
} from "lucide-react";

export const usersRolesInfo: Record<
  string,
  {
    icon: LucideIcon;
    suggestedLabels?: { label: string; description: string }[];
  }
> = {
  Founder: {
    icon: RocketIcon,
    suggestedLabels: [
      {
        label: "Customer Feedback",
        description: "Feedback and suggestions from customers",
      },
      {
        label: "Investor",
        description: "Communications from investors and VCs",
      },
      {
        label: "Team",
        description: "Internal team communications",
      },
      {
        label: "Urgent",
        description: "Time-sensitive emails requiring immediate attention",
      },
    ],
  },
  Executive: { icon: BriefcaseIcon },
  "Small Business Owner": { icon: StoreIcon },
  "Software Engineer": {
    icon: CodeIcon,
    suggestedLabels: [
      {
        label: "Alert",
        description: "Server errors and deployment notifications",
      },
      {
        label: "GitHub",
        description: "Pull requests and code reviews",
      },
      {
        label: "Bug",
        description: "Bug reports and issue tracking",
      },
      {
        label: "Security",
        description: "Security vulnerabilities and updates",
      },
    ],
  },
  Assistant: {
    icon: CalendarDaysIcon,
    suggestedLabels: [
      {
        label: "Schedule Meeting",
        description: "Emails that need a meeting to be scheduled",
      },
      {
        label: "To Do",
        description: "Tasks and action items to complete",
      },
      {
        label: "Travel",
        description: "Travel arrangements and itineraries",
      },
      {
        label: "Expense",
        description: "Receipts and expense reports to process",
      },
    ],
  },
  Investor: {
    icon: TrendingUpIcon,
    suggestedLabels: [
      {
        label: "Investor Update",
        description: "Portfolio company progress reports",
      },
      {
        label: "Pitch Deck",
        description: "Startup presentations and investment opportunities",
      },
      {
        label: "LP",
        description: "Limited Partner communications",
      },
      {
        label: "Due Diligence",
        description: "Investment research and analysis",
      },
    ],
  },
  Sales: {
    icon: PhoneIcon,
    suggestedLabels: [
      {
        label: "Prospect",
        description: "Potential customers and leads",
      },
      {
        label: "Customer",
        description: "Existing customer communications",
      },
      {
        label: "Deal Discussion",
        description: "Active negotiations and proposals",
      },
      {
        label: "Churn Risk",
        description: "Customers showing signs of cancellation",
      },
    ],
  },
  Marketing: { icon: MegaphoneIcon },
  "Customer Support": {
    icon: HeadphonesIcon,
    suggestedLabels: [
      {
        label: "Support Ticket",
        description: "Customer help requests and issues",
      },
      {
        label: "Bug",
        description: "Bug reports from customers",
      },
      {
        label: "Feature Request",
        description: "Customer suggestions for new features",
      },
      {
        label: "Urgent Support",
        description: "Critical issues requiring immediate attention",
      },
    ],
  },
  Realtor: {
    icon: HomeIcon,
    suggestedLabels: [
      {
        label: "Buyer Lead",
        description: "Potential home buyers inquiring about properties",
      },
      {
        label: "Seller Lead",
        description: "Property owners looking to sell",
      },
      {
        label: "Showing Request",
        description: "Requests to view properties",
      },
      {
        label: "Closing",
        description: "Documents and communications for property closings",
      },
    ],
  },
  "Content Creator": {
    icon: VideoIcon,
    suggestedLabels: [
      {
        label: "Sponsorship",
        description: "Brand sponsorship inquiries and deals",
      },
      {
        label: "Collab",
        description: "Collaboration requests from other creators",
      },
      {
        label: "Brand Deal",
        description: "Partnership opportunities with brands",
      },
      {
        label: "Press",
        description: "Media inquiries and interview requests",
      },
    ],
  },
  Consultant: { icon: UsersIcon },
  "E-commerce": { icon: ShoppingCartIcon },
  Student: {
    icon: GraduationCapIcon,
    suggestedLabels: [
      {
        label: "School",
        description: "Emails from professors and teaching staff",
      },
      {
        label: "Assignment",
        description: "Homework and project deadlines",
      },
      {
        label: "Internship",
        description: "Internship opportunities and applications",
      },
      {
        label: "Study Materials",
        description: "Class notes and learning resources",
      },
    ],
  },
  Individual: { icon: UserIcon },
  Other: { icon: CircleHelpIcon },
};
