/**
 * Generate a deterministic Firestore doc ID from student name.
 * e.g. "La'niyah" "Reed" → "la_niyah_reed"
 * e.g. "Bernal-Ortiz" "Johana" → "johana_bernal_ortiz"
 */
export function studentDocId(firstName: string, lastName: string): string {
  return `${firstName}_${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") // replace any non-alphanumeric with _
    .replace(/_+/g, "_")        // collapse consecutive underscores
    .replace(/^_|_$/g, "");     // trim leading/trailing underscores
}
