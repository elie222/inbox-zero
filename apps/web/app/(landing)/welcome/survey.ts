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
import { USER_ROLES as USER_ROLES_DATA } from "@/utils/constants/user-roles";

// Add icons to the plain user roles data for UI display
export const USER_ROLES = USER_ROLES_DATA.map((role) => {
  const iconMap: Record<string, any> = {
    Founder: RocketIcon,
    Executive: BriefcaseIcon,
    "Small Business Owner": StoreIcon,
    "Software Engineer": CodeIcon,
    Assistant: CalendarDaysIcon,
    Investor: TrendingUpIcon,
    Sales: PhoneIcon,
    Marketing: MegaphoneIcon,
    "Customer Support": HeadphonesIcon,
    Realtor: HomeIcon,
    "Content Creator": VideoIcon,
    Consultant: UsersIcon,
    "E-commerce": ShoppingCartIcon,
    Student: GraduationCapIcon,
    Individual: UserIcon,
    Other: CircleHelpIcon,
  };

  return {
    ...role,
    icon: iconMap[role.value],
  };
});

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
