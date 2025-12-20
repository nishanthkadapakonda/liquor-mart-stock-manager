/**
 * Parses a date string in YYYY-MM-DD format and stores it at noon UTC.
 * This prevents timezone conversion issues where dates shift by one day.
 * By storing at noon UTC, the date will remain the same regardless of timezone.
 * 
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object representing the date at noon UTC
 */
export function parseLocalDate(dateString: string): Date {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD`);
  }

  const [year, month, day] = dateString.split('-').map(Number);
  
  // Create date at noon UTC to avoid day boundary issues
  // This ensures the date stays the same regardless of server timezone
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * Formats a Date object to YYYY-MM-DD string in local timezone.
 * 
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

