/** Joins class names, skipping falsy ones (the ported components' cn(), without class merging). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
