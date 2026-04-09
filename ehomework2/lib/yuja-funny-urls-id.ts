import { createHash } from "node:crypto";

/**
 * Deterministic Firestore document ID for `yuja_funny_urls`: SHA-256 hex of UTF-8
 * `referencePlaybackUrlKey` (same string as returned by `normalizeHomeworkCaptureReferenceUrl`).
 */
export function referencePlaybackUrlKeyToYujaDocId(referencePlaybackUrlKey: string): string {
  return createHash("sha256").update(referencePlaybackUrlKey, "utf8").digest("hex");
}
