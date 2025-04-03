export function getTodayForLLM() {
  return `Today's date is: ${new Date().toISOString().split("T")[0]}.`;
}
