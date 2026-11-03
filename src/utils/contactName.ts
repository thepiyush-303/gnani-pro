/**
 * Returns the first word of a chat header title for UI labels
 * (e.g. "Ashmit Sharma" → "Ashmit"). Display only — never used to infer
 * the relationship with the contact.
 */
export function getCleanFirstName(title: string | null | undefined): string {
  const cleaned = (title ?? '').replace(/[‎‏‪-‮]/g, '').trim();
  const first = cleaned.split(/\s+/)[0] ?? '';
  return first.replace(/^[^\w\u0900-\u097F]+|[^\w\u0900-\u097F]+$/g, '') || 'Contact';
}
