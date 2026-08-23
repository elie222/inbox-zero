export const OUTLOOK_CATEGORY_COLORS = [
  { id: "preset0", value: "#E74C3C" },
  { id: "preset1", value: "#E67E22" },
  { id: "preset2", value: "#F1C40F" },
  { id: "preset3", value: "#2ECC71" },
  { id: "preset4", value: "#1ABC9C" },
  { id: "preset5", value: "#3498DB" },
  { id: "preset6", value: "#9B59B6" },
  { id: "preset7", value: "#E84393" },
  { id: "preset8", value: "#795548" },
  { id: "preset9", value: "#95A5A6" },
  { id: "preset10", value: "#AEB6BF" },
  { id: "preset11", value: "#5D6D7E" },
  { id: "preset12", value: "#BDC3C7" },
  { id: "preset13", value: "#7F8C8D" },
  { id: "preset14", value: "#2C3E50" },
  { id: "preset15", value: "#922B21" },
  { id: "preset16", value: "#A04000" },
  { id: "preset17", value: "#6E2C00" },
  { id: "preset18", value: "#9A7D0A" },
  { id: "preset19", value: "#196F3D" },
  { id: "preset20", value: "#0E6655" },
  { id: "preset21", value: "#556B2F" },
  { id: "preset22", value: "#1A5276" },
  { id: "preset23", value: "#5B2C6F" },
  { id: "preset24", value: "#7B241C" },
] as const;

export type OutlookCategoryColor =
  (typeof OUTLOOK_CATEGORY_COLORS)[number]["id"];

export const OUTLOOK_CATEGORY_COLOR_IDS = OUTLOOK_CATEGORY_COLORS.map(
  ({ id }) => id,
) as [OutlookCategoryColor, ...OutlookCategoryColor[]];

export const OUTLOOK_CATEGORY_COLOR_MAP = Object.fromEntries(
  OUTLOOK_CATEGORY_COLORS.map(({ id, value }) => [id, value]),
) as Record<OutlookCategoryColor, string>;
