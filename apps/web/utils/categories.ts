export const SenderCategory = {
  UNKNOWN: "Unknown",
  // Emails that don't fit any other category or can't be classified

  NEWSLETTER: "Newsletter",
  // "Weekly Tech Digest from TechCrunch"
  // "Monthly Fitness Tips from GymPro"
  // "Daily News Roundup from The New York Times"

  MARKETING: "Marketing",
  // "50% Off Summer Sale at Fashion Store"
  // "New Product Launch: Try Our Latest Gadget"
  // "Limited Time Offer: Join Our Premium Membership"

  RECEIPT: "Receipt",
  // "Your Amazon.com order confirmation"
  // "Receipt for your recent purchase at Apple Store"
  // "Payment confirmation for your Netflix subscription"

  BANKING: "Banking",
  // "Your monthly statement from Chase Bank"
  // "Important update about your savings account"
  // "Fraud alert: Unusual activity detected on your card"

  LEGAL: "Legal",
  // "Updates to our Terms of Service"
  // "Important information about your lawsuit"
  // "Contract for your review and signature"

  SUPPORT: "Support",
  // "Your support ticket #12345 has been resolved"
  // "Follow-up on your recent customer service inquiry"
  // "Troubleshooting guide for your recent issue"

  PERSONAL: "Personal",
  // "Hey, want to grab coffee this weekend?"
  // "Photos from last night's dinner"
  // "Happy birthday wishes from Mom"

  WORK: "Work",
  // "Meeting agenda for tomorrow's team sync"
  // "Quarterly performance review reminder"
  // "New project kickoff: Action items"

  SOCIAL: "Social",
  // "John Smith tagged you in a photo on Facebook"
  // "New connection request on LinkedIn"
  // "Your friend's status update on Instagram"

  EDUCATIONAL: "Educational",
  // "Your course schedule for the upcoming semester"
  // "Reminder: Assignment due next week"
  // "New learning resources available in your online class"

  TRAVEL: "Travel",
  // "Your flight itinerary for upcoming trip"
  // "Hotel reservation confirmation"
  // "Travel insurance policy for your vacation"

  HEALTH: "Health",
  // "Reminder: Your dental appointment is tomorrow"
  // "Lab test results are now available"
  // "Your prescription is ready for pickup"

  GOVERNMENT: "Government",
  // "Important update about your tax return"
  // "Voter registration information"
  // "Census Bureau: Please complete your survey"

  // CHARITY: "charity",
  // "Thank you for your recent donation"
  // "Volunteer opportunity: Help at our upcoming event"
  // "Impact report: See how your contributions helped"

  ENTERTAINMENT: "Entertainment",
  // "New movies available on your streaming service"
  // "Exclusive preview of our upcoming video game release"

  EVENTS: "Events",
  // "Invitation to Sarah's wedding"
  // "Reminder: Community BBQ this Saturday"
  // "Conference schedule and registration information"

  SHOPPING: "Shopping",
  // "Your wishlist items are now on sale"
  // "New arrivals at your favorite store"
  // "Shipping update: Your package is on its way"

  ACCOUNT: "Account",
  // "Password reset for your account"
  // "Security alert: New login detected"
  // "Your account settings have been updated"
} as const;

export type SenderCategory =
  (typeof SenderCategory)[keyof typeof SenderCategory];
