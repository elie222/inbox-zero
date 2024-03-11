// type - title
export const simpleEmailCategoriesArray: ReadonlyArray<
  readonly [string, string]
> = [
  ["IMPORTANT", "important"],
  ["CATEGORY_PERSONAL", "personal"],
  ["CATEGORY_SOCIAL", "social"],
  ["CATEGORY_PROMOTIONS", "promotions"],
  ["CATEGORY_UPDATES", "updates"],
  // ["CATEGORY_FORUMS", "forums"],
  ["OTHER", "other"],
];

export const simpleEmailCategories = new Map(simpleEmailCategoriesArray);

export const getNextCategory = (category: string): string | null => {
  const index = simpleEmailCategoriesArray.findIndex(([id]) => id === category);
  const next = simpleEmailCategoriesArray[index + 1];

  if (next) return next[0];

  return null;
};
