// Stripe amounts are in the currency's smallest unit, which is not always
// 1/100 of a unit: JPY has no minor unit, BHD has three decimal places.
// Dividing by 100 unconditionally understates a JPY charge by 100x.
export function formatStripeAmount(
  amountInMinorUnits: number,
  currency: string,
) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  const { maximumFractionDigits = 2 } = formatter.resolvedOptions();

  return formatter.format(amountInMinorUnits / 10 ** maximumFractionDigits);
}
