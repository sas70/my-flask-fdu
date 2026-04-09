/** Firestore collection for in-progress browser tab captures (admin-only). */
export const HOMEWORK_CAPTURE_SESSIONS = "homeworkCaptureSessions";

/** Subcollection under each session: one doc per chunk index. */
export const HOMEWORK_CAPTURE_CHUNKS_SUB = "chunks";

/**
 * MediaRecorder timeslice (ms). Default 1 minute — smaller WebM payloads per request (Vercel ~4.5 MB body limit).
 * Override with NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS (15000–600000).
 */
export function getHomeworkCaptureChunkMs(): number {
  const raw = process.env.NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS;
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 15_000 && n <= 600_000) return n;
  }
  return 60_000;
}
