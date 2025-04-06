export function getTodayForLLM(date: Date = new Date()) {
  return `Today's date and time is: ${date.toISOString()}.`;
}
