const newsletterSenders = ["substack.com", "mail.beehiiv.com", "ghost.io"];

export function isNewsletterSender(sender: string) {
  return (
    sender.toLowerCase().includes("newsletter") ||
    newsletterSenders.some((newsletter) => sender.includes(newsletter))
  );
}
