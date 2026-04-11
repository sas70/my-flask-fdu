import Link from "next/link";
import { notFound } from "next/navigation";
import GradingReportLetterhead from "@/app/admin/_components/GradingReportLetterhead";
import GradingReportPdfActions from "@/app/admin/_components/GradingReportPdfActions";
import GradingReportView from "@/app/admin/_components/GradingReportView";
import { buildGradingLetterhead, loadGradeReportForSubmission } from "@/lib/grading-report-data";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";

const GRADING_REPORT_PDF_ROOT_ID = "grading-report-pdf-capture";

export const dynamic = "force-dynamic";

export default async function GradingReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.collection("homeworkSubmissions").doc(id).get();

  if (!doc.exists) {
    notFound();
  }

  const sub = doc.data()!;
  const studentName = typeof sub.studentName === "string" ? sub.studentName : undefined;
  const week = typeof sub.week === "number" ? sub.week : undefined;
  const gradeReportUrl = typeof sub.gradeReportUrl === "string" ? sub.gradeReportUrl : undefined;

  const report = await loadGradeReportForSubmission(sub);
  const letterhead = report ? await buildGradingLetterhead(db, sub) : null;

  return (
    <div style={{ paddingBottom: "2rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          href={`/admin/submissions/${id}`}
          style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
        >
          &larr; Back to submission
        </Link>
      </div>

      {!report ? (
        <div style={{ ...s.card, borderColor: "var(--border)" }}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
            No grading report is available yet. Finish Cloud Function grading, or open{" "}
            <Link href={`/admin/submissions/${id}`} style={{ color: "var(--accent)" }}>
              the submission
            </Link>{" "}
            to check status.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "1.25rem" }}>
            <GradingReportPdfActions
              elementId={GRADING_REPORT_PDF_ROOT_ID}
              submissionId={id}
              studentName={studentName}
            />
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.5 }}>
              Download saves an A4 PDF locally. <strong>Upload PDF &amp; get share link</strong> stores the same
              PDF on ByteScale and gives you a URL to send to the student.
            </p>
          </div>

          <div
            id={GRADING_REPORT_PDF_ROOT_ID}
            className="grading-report-pdf-surface"
            style={{ overflow: "visible" }}
          >
            {letterhead && <GradingReportLetterhead {...letterhead} />}
            <GradingReportView report={report} studentName={studentName} week={week} />
          </div>
        </>
      )}

      {gradeReportUrl && (
        <p style={{ marginTop: "1.5rem", fontSize: "0.82rem", color: "var(--muted)" }}>
          <a href={gradeReportUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
            Open raw grade report JSON
          </a>
        </p>
      )}
    </div>
  );
}
