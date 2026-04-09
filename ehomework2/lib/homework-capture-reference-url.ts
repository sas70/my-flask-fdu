/**
 * Normalize LMS / Yuja URLs so the same video matches across minor URL differences.
 */
export function normalizeHomeworkCaptureReferenceUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    u.hash = "";
    const entries = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    const sp = new URLSearchParams();
    for (const [k, v] of entries) sp.append(k, v);
    u.search = sp.toString();
    return u.toString();
  } catch {
    return t;
  }
}
