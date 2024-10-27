export const SenderCategory = {
  UNKNOWN: "unknown",
  // Emails that don't fit any other category or can't be classified

  NEWSLETTER: "newsletter",
  // "Weekly Tech Digest from TechCrunch"
  // "Monthly Fitness Tips from GymPro"
  // "Daily News Roundup from The New York Times"

  MARKETING: "marketing",
  // "50% Off Summer Sale at Fashion Store"
  // "New Product Launch: Try Our Latest Gadget"
  // "Limited Time Offer: Join Our Premium Membership"

  RECEIPT: "receipt",
  // "Your Amazon.com order confirmation"
  // "Receipt for your recent purchase at Apple Store"
  // "Payment confirmation for your Netflix subscription"

  BANKING: "banking",
  // "Your monthly statement from Chase Bank"
  // "Important update about your savings account"
  // "Fraud alert: Unusual activity detected on your card"

  LEGAL: "legal",
  // "Updates to our Terms of Service"
  // "Important information about your lawsuit"
  // "Contract for your review and signature"

  SUPPORT: "support",
  // "Your support ticket #12345 has been resolved"
  // "Follow-up on your recent customer service inquiry"
  // "Troubleshooting guide for your recent issue"

  PERSONAL: "personal",
  // "Hey, want to grab coffee this weekend?"
  // "Photos from last night's dinner"
  // "Happy birthday wishes from Mom"

  WORK: "work",
  // "Meeting agenda for tomorrow's team sync"
  // "Quarterly performance review reminder"
  // "New project kickoff: Action items"

  SOCIAL: "social",
  // "John Smith tagged you in a photo on Facebook"
  // "New connection request on LinkedIn"
  // "Your friend's status update on Instagram"

  EDUCATIONAL: "educational",
  // "Your course schedule for the upcoming semester"
  // "Reminder: Assignment due next week"
  // "New learning resources available in your online class"

  TRAVEL: "travel",
  // "Your flight itinerary for upcoming trip"
  // "Hotel reservation confirmation"
  // "Travel insurance policy for your vacation"

  HEALTH: "health",
  // "Reminder: Your dental appointment is tomorrow"
  // "Lab test results are now available"
  // "Your prescription is ready for pickup"

  GOVERNMENT: "government",
  // "Important update about your tax return"
  // "Voter registration information"
  // "Census Bureau: Please complete your survey"

  // CHARITY: "charity",
  // "Thank you for your recent donation"
  // "Volunteer opportunity: Help at our upcoming event"
  // "Impact report: See how your contributions helped"

  ENTERTAINMENT: "entertainment",
  // "New movies available on your streaming service"
  // "Exclusive preview of our upcoming video game release"

  EVENTS: "events",
  // "Invitation to Sarah's wedding"
  // "Reminder: Community BBQ this Saturday"
  // "Conference schedule and registration information"

  SHOPPING: "shopping",
  // "Your wishlist items are now on sale"
  // "New arrivals at your favorite store"
  // "Shipping update: Your package is on its way"

  ACCOUNT: "account",
  // "Password reset for your account"
  // "Security alert: New login detected"
  // "Your account settings have been updated"
} as const;

export type SenderCategory =
  (typeof SenderCategory)[keyof typeof SenderCategory];
