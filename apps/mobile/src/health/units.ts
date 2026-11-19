/** Unit conversions for values the stores report with a unit string. */

export function toMinutes(quantity: number, unit: string): number | null {
  switch (unit) {
    case "s":
      return quantity / 60;
    case "min":
      return quantity;
    case "hr":
    case "h":
      return quantity * 60;
    default:
      return null;
  }
}

export function toKilometers(quantity: number, unit: string): number | null {
  switch (unit) {
    case "m":
    case "meters": // HealthKit's totalDistance unit
      return quantity / 1000;
    case "km":
      return quantity;
    case "mi":
      return quantity * 1.609344;
    default:
      return null;
  }
}

export function toKilocalories(quantity: number, unit: string): number | null {
  switch (unit) {
    case "kcal":
    case "Cal":
      return quantity;
    case "kJ":
      return quantity / 4.184;
    default:
      return null;
  }
}
