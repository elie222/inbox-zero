import data from "./html-tables.json";

export type HtmlToken = [
  string,
  string | number | [string, Record<string, string>],
];
type Value =
  | string
  | number
  | HtmlToken[]
  | [string, Record<string, string>]
  | Record<string, string>
  | null;
const tables = data.tables;
const returns: Record<number, number> = {
  1: 272,
  2: 277,
  3: 284,
  4: 284,
  5: 258,
  6: 259,
  7: 260,
  8: 261,
  9: 271,
  10: 279,
  11: 278,
  12: 278,
  16: 281,
  17: 283,
  18: 270,
  19: 273,
  20: 275,
  21: 276,
  22: 282,
  23: 286,
  24: 280,
  25: 262,
  26: 263,
  27: 274,
  29: 272,
};
const starts: Record<number, number> = {
  5: 11,
  6: 11,
  7: 1,
  8: 13,
  10: 11,
  11: 11,
  12: 11,
  14: 15,
  15: 1,
  16: 5,
  17: 1,
  19: 7,
  20: 1,
  22: 9,
  23: 1,
  25: 3,
  26: 1,
};

export function parseHtml(input: string): HtmlToken[] {
  const text = input
    .replace(/[^\s;]{800,}/gu, "")
    .replace(/<\/[^>]{100,}(?!>)/gu, "SpamSieve-BadCloseTag")
    .replace(/<meta [^>]{1000,}(?!>)/gu, "SpamSieve-BadOpenTag")
    .replaceAll("\0", "");
  const bytes = Buffer.from(text);
  let position = 0;
  let start = 1;
  function next(): [number, Value] {
    while (position < bytes.length) {
      let state = start;
      let cursor = position;
      let accepted: [number, number] | undefined;
      while (cursor <= bytes.length) {
        if (tables.accept[state]) accepted = [tables.accept[state], cursor];
        if (cursor === bytes.length) break;
        let eq = tables.ec[bytes[cursor]];
        let index = tables.base[state] + eq;
        let attempts = 0;
        while (tables.chk[index] !== state) {
          state = tables.def[state];
          if (state >= 80) eq = tables.meta[eq];
          index = tables.base[state] + eq;
          if (++attempts > 200) throw new Error("HTML scanner did not advance");
        }
        state = tables.nxt[index];
        cursor++;
        if (tables.base[state] === 263) {
          if (tables.accept[state]) accepted = [tables.accept[state], cursor];
          break;
        }
      }
      if (!accepted || accepted[1] <= position)
        throw new Error("HTML scanner did not advance");
      const [rule, end] = accepted;
      if (rule === 31) return [0, null];
      const raw = bytes.subarray(position, end).toString("utf8");
      position = end;
      start = starts[rule] ?? start;
      let value: Value = raw;
      if (rule === 3 || rule === 4) {
        const digits = /[0-9A-Fa-f]+/.exec(raw.slice(rule === 4 ? 3 : 2));
        value = Math.min(
          digits ? Number.parseInt(digits[0], rule === 4 ? 16 : 10) : 65,
          rule === 4 ? 0xff_ff_ff_ff : 0x7f_ff_ff_ff,
        );
      }
      if (returns[rule]) return [returns[rule], value];
    }
    return [0, null];
  }
  const states = [0];
  const values: Value[] = [];
  let look: [number, Value] | undefined;
  let errors = 0;
  let last: Value = [];
  for (let steps = 0; steps < Math.max(100_000, bytes.length * 20); steps++) {
    const state = states[states.length - 1];
    if (state === 2) return Array.isArray(last) ? (last as HtmlToken[]) : [];
    const pact = tables.pact[state];
    if (pact !== -16) {
      look ??= next();
      const symbol = look[0] <= 286 ? tables.translate[look[0]] : 2;
      const index = pact + symbol;
      if (index >= 0 && index <= 29 && tables.check[index] === symbol) {
        const shift = tables.table[index];
        if (!shift) return Array.isArray(last) ? (last as HtmlToken[]) : [];
        states.push(shift);
        values.push(look[1]);
        look = undefined;
        errors = Math.max(0, errors - 1);
        continue;
      }
    }
    const rule = tables.defact[state];
    if (!rule) {
      if (errors === 3) {
        look ??= next();
        if (!look[0]) return Array.isArray(last) ? (last as HtmlToken[]) : [];
        look = undefined;
      }
      errors = 3;
      while (states.length) {
        const current = states[states.length - 1];
        const index = tables.pact[current] + 1;
        if (
          tables.pact[current] !== -16 &&
          index >= 0 &&
          index <= 29 &&
          tables.check[index] === 1
        ) {
          states.push(tables.table[index]);
          values.push(null);
          break;
        }
        states.pop();
        values.pop();
      }
      if (!states.length)
        return Array.isArray(last) ? (last as HtmlToken[]) : [];
      continue;
    }
    const size = tables.r2[rule];
    const lhs = tables.r1[rule];
    const args = size ? values.slice(-size) : [];
    last = reduce(rule, args);
    if (size) {
      states.splice(-size);
      values.splice(-size);
    }
    const index = tables.pgoto[lhs - 32] + states[states.length - 1];
    const destination =
      index >= 0 &&
      index <= 29 &&
      tables.check[index] === states[states.length - 1]
        ? tables.table[index]
        : tables.defgoto[lhs - 32];
    states.push(destination);
    values.push(last);
  }
  throw new Error("HTML parser exceeded its work limit");
}

function reduce(rule: number, values: Value[]): Value {
  const list = values[0] as HtmlToken[];
  if (rule === 13) return [];
  if ([2, 3, 4, 12].includes(rule)) {
    const key = ({ 2: "E", 3: "#", 4: "T", 12: "*" } as Record<number, string>)[
      rule
    ];
    list.push([
      key,
      rule === 2
        ? String(values[1]).slice(1, -1)
        : rule === 12
          ? ""
          : (values[1] as string | number),
    ]);
    return list;
  }
  if ([5, 6, 7, 8, 10, 11].includes(rule)) {
    const key = (
      { 5: "<!--", 6: "<?", 7: "<?", 8: "<?", 10: "</", 11: "<" } as Record<
        number,
        string
      >
    )[rule];
    list.push([key, values[2] as HtmlToken[1]]);
    return list;
  }
  if (rule === 9) {
    list.push(["<!--", ""]);
    return list;
  }
  if (rule === 14)
    return [values[0] as string, values[1] as Record<string, string>];
  if (rule === 15) return [values[0] as string, {}];
  if (rule === 16) return String(values[0]).toLowerCase();
  if ([17, 18, 19].includes(rule))
    return {
      [String(values[0]).toLowerCase()]:
        rule === 19
          ? String(values[2]).slice(1, -1)
          : rule === 17
            ? String(values[2])
            : "",
    };
  if (rule === 20)
    return {
      ...(values[0] as Record<string, string>),
      ...(values[1] as Record<string, string>),
    };
  if (rule === 22) return String(values[0]) + values[1];
  return values[0] ?? null;
}
