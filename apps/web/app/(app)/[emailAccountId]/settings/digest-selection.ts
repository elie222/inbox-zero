export function reconcileDigestSelection({
  currentSelection,
  previousServerSelection,
  nextServerSelection,
  availableRuleIds,
}: {
  currentSelection: Set<string>;
  previousServerSelection: Set<string>;
  nextServerSelection: Set<string>;
  availableRuleIds: Set<string>;
}) {
  const reconciledSelection = new Set(
    [...currentSelection].filter((id) => availableRuleIds.has(id)),
  );

  for (const id of availableRuleIds) {
    const wasSelected = previousServerSelection.has(id);
    const isSelected = nextServerSelection.has(id);

    if (wasSelected === isSelected) continue;

    if (isSelected) {
      reconciledSelection.add(id);
    } else {
      reconciledSelection.delete(id);
    }
  }

  return setsAreEqual(currentSelection, reconciledSelection)
    ? currentSelection
    : reconciledSelection;
}

function setsAreEqual(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}
