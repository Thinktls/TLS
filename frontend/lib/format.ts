/** US date/time formatting utilities used across the app. */

const US_DATE: Intl.DateTimeFormatOptions = {
  month: "2-digit", day: "2-digit", year: "numeric",
};

// timeZoneName: "short" makes Intl append the correct abbreviation for the zone AND the date —
// "EST" in winter, "EDT" during daylight saving. The old code hardcoded " EST" year-round, so a
// July deadline showed the right America/New_York time but was mislabeled EST and read an hour
// off from anything that used a fixed -5 offset.
const US_DATETIME: Intl.DateTimeFormatOptions = {
  month: "2-digit", day: "2-digit", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
  timeZone: "America/New_York",
  timeZoneName: "short",
};

/** "06/13/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", US_DATE);
}

/** "06/13/2026, 02:30 PM EDT" */
export function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", US_DATETIME);
}

/** Short form for tight spaces: "Jun 13, 2:30 PM EDT" */
export function fmtDatetimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}
