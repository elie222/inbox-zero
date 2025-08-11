export const USER_ROLES = [
  {
    value: "Founder",
    description: "Building a startup or running my own company",
  },
  {
    value: "Executive",
    description: "C-level, VP, or Director managing teams",
  },
  {
    value: "Small Business Owner",
    description: "Running a local business or solo venture",
  },
  {
    value: "Software Engineer",
    description: "Writing code and building software",
  },
  {
    value: "Assistant",
    description: "Managing communications and calendars for others",
  },
  {
    value: "Investor",
    description: "VC, angel investor, or fund manager",
  },
  {
    value: "Sales",
    description: "Closing deals and managing client relationships",
  },
  {
    value: "Marketing",
    description: "Growing brands and driving campaigns",
  },
  {
    value: "Customer Support",
    description: "Helping customers and resolving issues",
  },
  {
    value: "Realtor",
    description: "Buying, selling, and managing properties",
  },
  {
    value: "Content Creator",
    description: "YouTuber, blogger, or social media influencer",
  },
  {
    value: "Consultant",
    description: "Advising businesses and solving problems",
  },
  {
    value: "E-commerce",
    description: "Running an online store or marketplace",
  },
  {
    value: "Student",
    description: "Studying at school or university",
  },
  {
    value: "Individual",
    description: "Managing my personal email",
  },
  {
    value: "Other",
    description: "My role isn't listed here",
  },
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserRoleValue = UserRole["value"];
