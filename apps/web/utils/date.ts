export function formatShortDate(
  date: Date,
  options: {
    includeYear?: boolean;
    lowercase?: boolean;
  } = {
    includeYear: false,
    lowercase: false,
  }
) {
  // if date is today, return the time. eg. 12:30pm
  // if date is before today then return the date. eg JUL 5th or AUG 13th

  const today = new Date();

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    const formattedDate = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: options.includeYear ? "numeric" : undefined,
    });

    return options.lowercase ? formattedDate : formattedDate.toUpperCase();
  }
}
