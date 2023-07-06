export function formatShortDate(date: Date) {
  // if date is today, return the time. eg. 12:30pm
  // if date is before today then return the date. eg JUL 5th or AUG 13th

  const today = new Date();

  const isToday = date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }).toLocaleUpperCase();
  }
}