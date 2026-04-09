import type { Firestore, Timestamp } from "firebase-admin/firestore";
import {
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

export async function loadSortedChunks(db: Firestore, sessionId: string) {
  const snap = await chunksCollection(db, sessionId).orderBy("chunkIndex", "asc").get();
  return snap.docs.map((doc) => doc.data() as CaptureChunkDoc);
}

export type CaptureChunkDoc = {
  chunkIndex: number;
  url: string;
  name: string;
  mimeType: string;
  uploadedAt: Timestamp;
};
