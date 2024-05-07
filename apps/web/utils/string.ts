export function truncate(str: string, length: number) {
  return str.length > length ? str.slice(0, length) + "..." : str;
}
