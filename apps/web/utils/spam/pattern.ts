export function compilePattern(pattern: string, global = false): RegExp {
  let result = "";
  const stack: number[] = [0];
  let inClass = false;
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "\\") {
      result += char + pattern[++index];
      continue;
    }
    if (char === "[") inClass = true;
    if (char === "]") inClass = false;
    if (!inClass) {
      const flag = /^\(\?(-?i)\)/.exec(pattern.slice(index));
      if (flag) {
        result += `(?${flag[1]}:`;
        stack[stack.length - 1]++;
        index += flag[0].length - 1;
        continue;
      }
      if (char === "(") stack.push(0);
      if (char === ")") result += ")".repeat(stack.pop() ?? 0);
    }
    result += char;
  }
  result += ")".repeat(stack[0]);
  result = result
    .replaceAll("[:space:]", "\\p{White_Space}")
    .replaceAll("[:punct:]", "\\p{Punctuation}\\p{Symbol}")
    .replaceAll("[:alpha:]", "\\p{Alphabetic}")
    .replaceAll("[:alnum:]", "\\p{Alphabetic}\\p{Decimal_Number}")
    .replaceAll("[:digit:]", "\\p{Decimal_Number}");
  return new RegExp(result, global ? "gu" : "u");
}
