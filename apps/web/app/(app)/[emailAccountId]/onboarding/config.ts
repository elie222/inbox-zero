import { prefixPath } from "@/utils/path";
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

export const ONBOARDING_STEPS = 5;

export const nextUrl = (emailAccountId: string, step: number) => {
  if (step >= ONBOARDING_STEPS) return "/welcome-upgrade";
  return prefixPath(emailAccountId, `/onboarding?step=${step + 1}`);
};

export const usersRolesInfo: Record<
  string,
  {
    icon: LucideIcon;
    suggestedLabels: { label: string; description: string }[];
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
  Executive: {
    icon: BriefcaseIcon,
    suggestedLabels: [
      {
        label: "Board",
        description: "Board meetings, materials, and director communications",
      },
      {
        label: "Strategic Initiative",
        description: "High-priority strategic projects and planning",
      },
      {
        label: "Direct Reports",
        description: "Communications from team leaders and direct reports",
      },
      {
        label: "Key Stakeholder",
        description:
          "Important partners, major clients, and VIP communications",
      },
    ],
  },
  "Small Business Owner": {
    icon: StoreIcon,
    suggestedLabels: [
      {
        label: "Customer Feedback",
        description: "Feedback and suggestions from customers",
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
        label: "Company Update",
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
  Marketing: {
    icon: MegaphoneIcon,
    suggestedLabels: [
      {
        label: "Campaign",
        description: "Marketing campaigns and promotional activities",
      },
      {
        label: "Content Review",
        description: "Content drafts requiring approval or feedback",
      },
      {
        label: "Analytics Report",
        description: "Performance metrics and marketing analytics",
      },
      {
        label: "Partner/Agency",
        description: "Communications with marketing agencies and partners",
      },
    ],
  },
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
  Consultant: {
    icon: UsersIcon,
    suggestedLabels: [
      {
        label: "Client Project",
        description: "Active client engagements and project updates",
      },
      {
        label: "Proposal",
        description: "New business proposals and RFP responses",
      },
      {
        label: "Professional Network",
        description: "Industry contacts and referral opportunities",
      },
    ],
  },
  "E-commerce": { icon: ShoppingCartIcon, suggestedLabels: [] },
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
  Individual: { icon: UserIcon, suggestedLabels: [] },
  Other: { icon: CircleHelpIcon, suggestedLabels: [] },
};
