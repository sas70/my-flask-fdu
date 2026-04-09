import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  getHomeworkCaptureChunkMs,
  HOMEWORK_CAPTURE_SESSIONS,
} from "@/lib/homework-capture-constants";
import { normalizeHomeworkCaptureReferenceUrl } from "@/lib/homework-capture-reference-url";
import { findOpenResumeSession, getResumeSessionPayload } from "@/lib/homework-capture-resume";
import { assertStudentExists } from "@/lib/homework-capture-server";
import { ensureSessionYujaFunnyDoc, getOrCreateYujaFunnyDoc } from "@/lib/yuja-funny-urls";

export const maxDuration = 30;

/**
 * Starts a browser capture session (tab recording). Chunks are uploaded separately.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      studentId?: string;
      week?: number;
      studentName?: string;
      referenceUrl?: string;
      /** If true, always create a new session (do not resume). */
      forceNew?: boolean;
      /** If false, skip resume even when reference URL matches (default: resume when URL present). */
      resumeIfExists?: boolean;
    };

    const studentId = String(body.studentId || "").trim();
    const week = Number(body.week);
    const referenceUrl = String(body.referenceUrl || "").trim();
    const nameOverride = String(body.studentName || "").trim();
    const forceNew = body.forceNew === true;
    const resumeIfExists = body.resumeIfExists !== false;
    const refKey = referenceUrl ? normalizeHomeworkCaptureReferenceUrl(referenceUrl) : null;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }
    if (!body.week || Number.isNaN(week) || week < 1) {
      return NextResponse.json({ error: "week must be a positive number" }, { status: 400 });
    }

    const db = getDb();
    const st = await assertStudentExists(db, studentId);
    if (!st.ok) {
      return NextResponse.json({ error: st.error }, { status: 404 });
    }

    const studentName = nameOverride || st.studentName;

    if (!forceNew && resumeIfExists && refKey) {
      const existing = await findOpenResumeSession(db, studentId, week, refKey);
      if (existing) {
        const yujaResolved = await ensureSessionYujaFunnyDoc(db, existing.sessionId);
        const payload = await getResumeSessionPayload(db, existing.sessionId);
        return NextResponse.json({
          ok: true,
          resumed: true,
          sessionId: existing.sessionId,
          studentName,
          chunkMs: getHomeworkCaptureChunkMs(),
          chunks: payload.chunks,
          nextChunkIndex: payload.nextChunkIndex,
          yujaFunnyUrlsDocId: yujaResolved ?? payload.yujaFunnyUrlsDocId,
        });
      }
    }

    let yujaFunnyUrlsDocId: string | null = null;
    if (referenceUrl.trim()) {
      const yuja = await getOrCreateYujaFunnyDoc(db, referenceUrl);
      yujaFunnyUrlsDocId = yuja.docId;
    }

    const ref = await db.collection(HOMEWORK_CAPTURE_SESSIONS).add({
      studentId,
      studentName,
      week,
      referencePlaybackUrl: referenceUrl || null,
      referencePlaybackUrlKey: refKey,
      yujaFunnyUrlsDocId,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      resumed: false,
      sessionId: ref.id,
      studentName,
      chunkMs: getHomeworkCaptureChunkMs(),
      yujaFunnyUrlsDocId: yujaFunnyUrlsDocId ?? undefined,
    });
  } catch (e) {
    console.error("[homework-capture/session]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Session create failed" },
      { status: 500 }
    );
  }
}
