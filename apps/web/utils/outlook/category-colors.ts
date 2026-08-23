export const OUTLOOK_CATEGORY_COLORS = [
  { id: "preset0", name: "Red", value: "#E74C3C" },
  { id: "preset1", name: "Orange", value: "#E67E22" },
  { id: "preset2", name: "Brown", value: "#795548" },
  { id: "preset3", name: "Yellow", value: "#F1C40F" },
  { id: "preset4", name: "Green", value: "#2ECC71" },
  { id: "preset5", name: "Teal", value: "#1ABC9C" },
  { id: "preset6", name: "Olive", value: "#808000" },
  { id: "preset7", name: "Blue", value: "#3498DB" },
  { id: "preset8", name: "Purple", value: "#9B59B6" },
  { id: "preset9", name: "Cranberry", value: "#E84393" },
  { id: "preset10", name: "Steel", value: "#AEB6BF" },
  { id: "preset11", name: "Dark steel", value: "#5D6D7E" },
  { id: "preset12", name: "Gray", value: "#BDC3C7" },
  { id: "preset13", name: "Dark gray", value: "#7F8C8D" },
  { id: "preset14", name: "Black", value: "#2C3E50" },
  { id: "preset15", name: "Dark red", value: "#922B21" },
  { id: "preset16", name: "Dark orange", value: "#A04000" },
  { id: "preset17", name: "Dark brown", value: "#6E2C00" },
  { id: "preset18", name: "Dark yellow", value: "#9A7D0A" },
  { id: "preset19", name: "Dark green", value: "#196F3D" },
  { id: "preset20", name: "Dark teal", value: "#0E6655" },
  { id: "preset21", name: "Dark olive", value: "#556B2F" },
  { id: "preset22", name: "Dark blue", value: "#1A5276" },
  { id: "preset23", name: "Dark purple", value: "#5B2C6F" },
  { id: "preset24", name: "Dark cranberry", value: "#7B241C" },
] as const;

export type OutlookCategoryColor =
  (typeof OUTLOOK_CATEGORY_COLORS)[number]["id"];

export const OUTLOOK_CATEGORY_COLOR_IDS = OUTLOOK_CATEGORY_COLORS.map(
  ({ id }) => id,
) as [OutlookCategoryColor, ...OutlookCategoryColor[]];

export const OUTLOOK_CATEGORY_COLOR_MAP = Object.fromEntries(
  OUTLOOK_CATEGORY_COLORS.map(({ id, value }) => [id, value]),
) as Record<OutlookCategoryColor, string>;

export function getOutlookCategoryPreset(
  backgroundColor: string,
): OutlookCategoryColor | undefined {
  return OUTLOOK_CATEGORY_COLORS.find(
    (option) => option.value.toLowerCase() === backgroundColor.toLowerCase(),
  )?.id;
}
