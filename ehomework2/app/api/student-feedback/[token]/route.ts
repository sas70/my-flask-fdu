import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import type { GradeReportData } from "@/app/admin/_components/GradingReportView";
import { buildGradingLetterhead, loadGradeReportForSubmission } from "@/lib/grading-report-data";
import type { StudentFeedbackReturn } from "@/lib/student-feedback-payload";
import { normalizeFeedbackPayload } from "@/lib/student-feedback-payload";
import { getDb } from "@/lib/firebase-admin";

export const maxDuration = 60;

function parseStoredStudentFeedback(raw: unknown): StudentFeedbackReturn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const strArr = (x: unknown) => (Array.isArray(x) ? x.map((v) => String(v ?? "")) : []);
  return {
    categoryReplies: strArr(o.categoryReplies),
    overallParagraphReplies: strArr(o.overallParagraphReplies),
    strengthItemReplies: strArr(o.strengthItemReplies),
    areaItemReplies: strArr(o.areaItemReplies),
    generalComment: typeof o.generalComment === "string" ? o.generalComment : "",
  };
}

async function findSubmissionByFeedbackToken(token: string) {
  const db = getDb();
  const q = await db.collection("homeworkSubmissions").where("studentFeedbackToken", "==", token).limit(1).get();
  if (q.empty) return null;
  return { ref: q.docs[0].ref, id: q.docs[0].id, data: q.docs[0].data() };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    const found = await findSubmissionByFeedbackToken(token);
    if (!found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const db = getDb();
    const report = await loadGradeReportForSubmission(found.data);
    if (!report) {
      return NextResponse.json({ error: "No grading report available for this submission yet." }, { status: 409 });
    }

    const letterhead = await buildGradingLetterhead(db, found.data);
    const studentName = typeof found.data.studentName === "string" ? found.data.studentName : undefined;
    const week = typeof found.data.week === "number" ? found.data.week : undefined;

    const existing = parseStoredStudentFeedback(found.data.studentFeedbackReturn);

    return NextResponse.json({
      ok: true,
      submissionId: found.id,
      studentName,
      week,
      report: report as GradeReportData,
      letterhead,
      existingFeedback: existing ?? null,
    });
  } catch (e) {
    console.error("[student-feedback GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    const found = await findSubmissionByFeedbackToken(token);
    if (!found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const report = await loadGradeReportForSubmission(found.data);
    if (!report) {
      return NextResponse.json({ error: "No grading report to respond to." }, { status: 409 });
    }

    const body = (await request.json()) as Partial<StudentFeedbackReturn>;
    const normalized = normalizeFeedbackPayload(report, body);

    await found.ref.update({
      studentFeedbackReturn: {
        ...normalized,
        submittedAt: FieldValue.serverTimestamp(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[student-feedback POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
