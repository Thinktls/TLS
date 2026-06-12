/** US date/time formatting utilities used across the app. */

const US_DATE: Intl.DateTimeFormatOptions = {
  month: "2-digit", day: "2-digit", year: "numeric",
};

const US_DATETIME: Intl.DateTimeFormatOptions = {
  month: "2-digit", day: "2-digit", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
  timeZone: "America/New_York",
};

/** "06/13/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", US_DATE);
}

/** "06/13/2026 02:30 PM EST" */
export function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", US_DATETIME) + " EST";
}

/** Short form for tight spaces: "Jun 13, 2:30 PM EST" */
export function fmtDatetimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/New_York",
  }) + " EST";
}
