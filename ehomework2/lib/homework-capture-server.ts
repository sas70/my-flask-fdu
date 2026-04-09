import type { Firestore, Timestamp } from "firebase-admin/firestore";
import {
  getHomeworkCaptureChunkMs,
  HOMEWORK_CAPTURE_CHUNKS_SUB,
  HOMEWORK_CAPTURE_SESSIONS,
} from "@/lib/homework-capture-constants";

export function sessionRef(db: Firestore, sessionId: string) {
  return db.collection(HOMEWORK_CAPTURE_SESSIONS).doc(sessionId);
}

export function chunksCollection(db: Firestore, sessionId: string) {
  return sessionRef(db, sessionId).collection(HOMEWORK_CAPTURE_CHUNKS_SUB);
}

export async function assertStudentExists(db: Firestore, studentId: string) {
  const snap = await db.collection("students").doc(studentId).get();
  if (!snap.exists) return { ok: false as const, error: "Student not found" };
  const d = snap.data()!;
  const studentName =
    [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || "Student";
  return { ok: true as const, studentName };
}

/**
 * Merge Firestore chunk data with timeline fields. Older docs without `startOffsetMs` /
 * `endOffsetMs` / `durationMs` are inferred from `chunkIndex` and stored or env nominal slice length.
 */
export function normalizeRawChunkData(
  raw: Record<string, unknown>,
  docId: string
): CaptureChunkDoc {
  const chunkIndex =
    typeof raw.chunkIndex === "number" && Number.isFinite(raw.chunkIndex)
      ? raw.chunkIndex
      : Number(docId);
  const envNominalMs = getHomeworkCaptureChunkMs();
  const storedNominal =
    typeof raw.chunkLengthNominalMs === "number" && raw.chunkLengthNominalMs > 0
      ? raw.chunkLengthNominalMs
      : envNominalMs;

  const hasStoredTimeline =
    typeof raw.startOffsetMs === "number" &&
    Number.isFinite(raw.startOffsetMs) &&
    typeof raw.endOffsetMs === "number" &&
    Number.isFinite(raw.endOffsetMs) &&
    typeof raw.durationMs === "number" &&
    Number.isFinite(raw.durationMs);

  let startOffsetMs: number;
  let endOffsetMs: number;
  let durationMs: number;
  let durationSource: "nominal" | "client" | undefined;

  if (hasStoredTimeline) {
    startOffsetMs = raw.startOffsetMs as number;
    endOffsetMs = raw.endOffsetMs as number;
    durationMs = raw.durationMs as number;
    durationSource =
      raw.durationSource === "client" || raw.durationSource === "nominal"
        ? raw.durationSource
        : undefined;
  } else {
    durationMs = storedNominal;
    startOffsetMs = chunkIndex * storedNominal;
    endOffsetMs = startOffsetMs + durationMs;
    durationSource = "nominal";
  }

  return {
    chunkIndex,
    url: String(raw.url ?? ""),
    name: String(raw.name ?? ""),
    mimeType: String(raw.mimeType ?? ""),
    uploadedAt: raw.uploadedAt as Timestamp,
    startOffsetMs,
    endOffsetMs,
    durationMs,
    chunkLengthNominalMs: storedNominal,
    durationSource,
  };
}

export async function loadSortedChunks(db: Firestore, sessionId: string) {
  const snap = await chunksCollection(db, sessionId).orderBy("chunkIndex", "asc").get();
  return snap.docs.map((doc) => normalizeRawChunkData(doc.data() as Record<string, unknown>, doc.id));
}

export type CaptureChunkDoc = {
  chunkIndex: number;
  url: string;
  name: string;
  mimeType: string;
  uploadedAt: Timestamp;
  /** Ms from recording start to chunk start (timeline). */
  startOffsetMs: number;
  /** Ms from recording start to chunk end (exclusive end = next chunk start). */
  endOffsetMs: number;
  /** Wall duration of this chunk (may differ from nominal for last segment if client sends durationMs). */
  durationMs: number;
  /** MediaRecorder timeslice used when this chunk was produced (from env at upload time). */
  chunkLengthNominalMs: number;
  /** "nominal" | "client" — whether duration/end used client-reported duration. */
  durationSource?: "nominal" | "client";
};
