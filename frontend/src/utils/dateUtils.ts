import dayjs from "dayjs";

/**
 * Parses a date from the backend (which may be in ISO format with timezone)
 * and extracts just the date part without timezone conversion.
 * This prevents dates from shifting by one day due to timezone differences.
 * 
 * @param dateValue - Date string or Date object from backend
 * @returns dayjs object representing the date in local timezone
 */
export function parseDate(dateValue: string | Date): dayjs.Dayjs {
  // If it's already a Date object, convert to ISO string first
  const dateStr = typeof dateValue === 'string' ? dateValue : dateValue.toISOString();
  
  // Extract just the date part (YYYY-MM-DD) before the 'T' or space
  const dateOnly = dateStr.split('T')[0].split(' ')[0];
  
  // Parse as local date (dayjs by default parses in local timezone)
  return dayjs(dateOnly);
}

/**
 * Formats a date to YYYY-MM-DD string for date inputs.
 * 
 * @param dateValue - Date string or Date object
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateInput(dateValue: string | Date): string {
  return parseDate(dateValue).format("YYYY-MM-DD");
}

