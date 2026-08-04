/** All money is stored as integer paise. These helpers are display-only. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return paise % 100 === 0 ? inr.format(rupees) : inrWithPaise.format(rupees);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
