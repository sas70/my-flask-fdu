import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { getHomeworkCaptureChunkMs } from "@/lib/homework-capture-constants";
import { normalizeHomeworkCaptureReferenceUrl } from "@/lib/homework-capture-reference-url";
import { findOpenResumeSession, getResumeSessionPayload } from "@/lib/homework-capture-resume";
import { assertStudentExists } from "@/lib/homework-capture-server";
import { ensureSessionYujaFunnyDoc } from "@/lib/yuja-funny-urls";

export const maxDuration = 30;

/**
 * GET: find open capture session + chunks for student + week + reference URL (resume without creating).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = String(searchParams.get("studentId") || "").trim();
    const weekRaw = searchParams.get("week");
    const referenceUrl = String(searchParams.get("referenceUrl") || "").trim();
    const week = Number(weekRaw);

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }
    if (!weekRaw || Number.isNaN(week) || week < 1) {
      return NextResponse.json({ error: "week must be a positive number" }, { status: 400 });
    }
    if (!referenceUrl) {
      return NextResponse.json({ error: "referenceUrl is required to match a saved session" }, { status: 400 });
    }

    const db = getDb();
    const st = await assertStudentExists(db, studentId);
    if (!st.ok) {
      return NextResponse.json({ error: st.error }, { status: 404 });
    }

    const refKey = normalizeHomeworkCaptureReferenceUrl(referenceUrl);
    if (!refKey) {
      return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
    }

    const existing = await findOpenResumeSession(db, studentId, week, refKey);
    if (!existing) {
      return NextResponse.json({ error: "No open session found for this student, week, and video URL." }, { status: 404 });
    }

    const yujaResolved = await ensureSessionYujaFunnyDoc(db, existing.sessionId);
    const payload = await getResumeSessionPayload(db, existing.sessionId);
    return NextResponse.json({
      ok: true,
      sessionId: existing.sessionId,
      studentName: st.studentName,
      chunkMs: getHomeworkCaptureChunkMs(),
      chunks: payload.chunks,
      nextChunkIndex: payload.nextChunkIndex,
      yujaFunnyUrlsDocId: yujaResolved ?? payload.yujaFunnyUrlsDocId,
    });
  } catch (e) {
    console.error("[homework-capture/resume GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resume lookup failed" },
      { status: 500 }
    );
  }
}
