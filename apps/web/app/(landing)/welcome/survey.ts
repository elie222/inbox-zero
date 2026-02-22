// copy pasted from PostHog
import { USER_ROLES } from "@/utils/constants/user-roles";
import { BRAND_NAME } from "@/utils/branding";

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
      question: `What are you looking to achieve with ${BRAND_NAME}?`,
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
    //   skippable: false,
    // },
    {
      key: "source",
      type: "single_choice",
      question: `How did you hear about ${BRAND_NAME}?`,
      choices: [
        "Search",
        "Friend",
        "Twitter",
        "GitHub",
        "YouTube",
        "Reddit",
        "Facebook",
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
