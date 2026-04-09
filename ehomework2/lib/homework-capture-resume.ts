import type { Firestore } from "firebase-admin/firestore";
import {
  HOMEWORK_CAPTURE_SESSIONS,
} from "@/lib/homework-capture-constants";
import { loadSortedChunks } from "@/lib/homework-capture-server";
import { normalizeHomeworkCaptureReferenceUrl } from "@/lib/homework-capture-reference-url";

function sessionReferenceKey(data: Record<string, unknown>): string | null {
  const k = data.referencePlaybackUrlKey;
  if (typeof k === "string" && k.trim()) return k.trim();
  const u = data.referencePlaybackUrl;
  if (typeof u === "string" && u.trim()) return normalizeHomeworkCaptureReferenceUrl(u);
  return null;
}

/**
 * Find the most recently updated open session for this student, week, and reference video URL.
 */
export async function findOpenResumeSession(
  db: Firestore,
  studentId: string,
  week: number,
  refKey: string | null
): Promise<{ sessionId: string } | null> {
  if (!refKey) return null;

  const snap = await db
    .collection(HOMEWORK_CAPTURE_SESSIONS)
    .where("studentId", "==", studentId)
    .where("week", "==", week)
    .where("status", "==", "open")
    .get();

  let best: { id: string; updated: number } | null = null;
  for (const doc of snap.docs) {
    const d = doc.data();
    const key = sessionReferenceKey(d);
    if (key !== refKey) continue;
    const updated = doc.updateTime?.toMillis?.() ?? doc.createTime?.toMillis?.() ?? 0;
    if (!best || updated > best.updated) {
      best = { id: doc.id, updated };
    }
  }
  return best ? { sessionId: best.id } : null;
}

export async function getResumeSessionPayload(db: Firestore, sessionId: string) {
  const sess = await db.collection(HOMEWORK_CAPTURE_SESSIONS).doc(sessionId).get();
  const sessionData = sess.exists ? (sess.data() as Record<string, unknown>) : {};
  const yujaFunnyUrlsDocId =
    typeof sessionData.yujaFunnyUrlsDocId === "string" && sessionData.yujaFunnyUrlsDocId.trim()
      ? sessionData.yujaFunnyUrlsDocId.trim()
      : undefined;

  const chunks = await loadSortedChunks(db, sessionId);
  const nextChunkIndex =
    chunks.length === 0 ? 0 : Math.max(...chunks.map((c) => c.chunkIndex)) + 1;
  return {
    chunks: chunks.map((c) => ({
      chunkIndex: c.chunkIndex,
      url: c.url,
      name: c.name,
      mimeType: c.mimeType,
      startOffsetMs: c.startOffsetMs,
      endOffsetMs: c.endOffsetMs,
      durationMs: c.durationMs,
      chunkLengthNominalMs: c.chunkLengthNominalMs,
      durationSource: c.durationSource,
    })),
    nextChunkIndex,
    yujaFunnyUrlsDocId,
  };
}
