// copy pasted from PostHog

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
} from "lucide-react";

export const USER_ROLES = [
  {
    value: "Founder",
    description: "Building a startup or running my own company",
    icon: RocketIcon,
  },
  {
    value: "Executive",
    description: "C-level, VP, or Director managing teams",
    icon: BriefcaseIcon,
  },
  {
    value: "Small Business Owner",
    description: "Running a local business or solo venture",
    icon: StoreIcon,
  },
  {
    value: "Software Engineer",
    description: "Writing code and building software",
    icon: CodeIcon,
  },
  {
    value: "Assistant",
    description: "Managing communications and calendars for others",
    icon: CalendarDaysIcon,
  },
  {
    value: "Investor",
    description: "VC, angel investor, or fund manager",
    icon: TrendingUpIcon,
  },
  {
    value: "Sales",
    description: "Closing deals and managing client relationships",
    icon: PhoneIcon,
  },
  {
    value: "Marketing",
    description: "Growing brands and driving campaigns",
    icon: MegaphoneIcon,
  },
  {
    value: "Customer Support",
    description: "Helping customers and resolving issues",
    icon: HeadphonesIcon,
  },
  {
    value: "Realtor",
    description: "Buying, selling, and managing properties",
    icon: HomeIcon,
  },
  {
    value: "Content Creator",
    description: "YouTuber, blogger, or social media influencer",
    icon: VideoIcon,
  },
  {
    value: "Consultant",
    description: "Advising businesses and solving problems",
    icon: UsersIcon,
  },
  {
    value: "E-commerce",
    description: "Running an online store or marketplace",
    icon: ShoppingCartIcon,
  },
  {
    value: "Student",
    description: "Studying at school or university",
    icon: GraduationCapIcon,
  },
  {
    value: "Individual",
    description: "Managing my personal email",
    icon: UserIcon,
  },
  {
    value: "Other",
    description: "My role isn't listed here",
    icon: CircleHelpIcon,
  },
] as const;

export const survey = {
  questions: [
    {
      key: "features",
      type: "multiple_choice",
      question: "Which features are you most interested in?",
      choices: [
        "AI Personal Assistant",
        "Bulk Unsubscriber",
        "Cold Email Blocker",
        "Reply/Follow-up Tracker",
        "Email Analytics",
        "Other",
      ],
    },
    {
      key: "role",
      type: "single_choice",
      question: "Which role best describes you?",
      choices: USER_ROLES.map((role) => role.value),
      skippable: true,
    },
    {
      key: "goal",
      type: "single_choice",
      question: "What are you looking to achieve with Inbox Zero?",
      choices: [
        "Clean up my existing emails",
        "Manage my inbox better going forward",
        "Both",
      ],
    },
    // {
    //   key: "company_size",
    //   type: "single_choice",
    //   question: "What is the size of your company?",
    //   choices: [
    //     "Only me",
    //     "2-10 people",
    //     "11-100 people",
    //     "101-1000 people",
    //     "1000+ people",
    //   ],
    // },
    {
      key: "source",
      type: "single_choice",
      question: "How did you hear about Inbox Zero?",
      choices: [
        "Search",
        "Friend",
        "Twitter",
        "Facebook",
        "YouTube",
        "Reddit",
        "Newsletter",
        "Product Hunt",
        "HackerNews",
        "TikTok",
        "Instagram",
        "Other",
      ],
      skippable: true,
    },
    {
      key: "improvements",
      type: "open",
      question:
        "Last question! If you had a magic wand, what would you want to improve about your email experience?",
    },
  ],
};
