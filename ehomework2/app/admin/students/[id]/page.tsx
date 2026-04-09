import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import EditStudentForm from "../../_components/EditStudentForm";
import StudentDocUpload from "../../_components/StudentDocUpload";
import DeleteStudentButton from "../../_components/DeleteStudentButton";
import StudentHomeworkVideos from "../../_components/StudentHomeworkVideos";
import HomeworkIngestForm from "../../_components/HomeworkIngestForm";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.collection("students").doc(id).get();

  if (!doc.exists) {
    notFound();
  }

  const student = doc.data()!;
  const bioTrim = (student.bio || "").trim();
  const surveyMap = (student.surveyResponses || {}) as Record<string, string>;
  const hasSurvey =
    !!student.surveyReady ||
    Object.keys(surveyMap).some((k) => String(surveyMap[k] || "").trim());
  const hasProfileSummary = !!(student.instructorProfileSummary && String(student.instructorProfileSummary).trim());

  // Fetch this student's submissions
  const subsSnap = await db
    .collection("homeworkSubmissions")
    .where("studentId", "==", id)
    .get();

  const submissions = subsSnap.docs
    .map((d) => {
      const data = d.data();
      const videos = (data.videos || []) as { name?: string; url?: string }[];
      const urls = (data.urls || []) as string[];
      const attachments = (data.attachments || []) as { name?: string; url?: string; mimeType?: string }[];
      return {
        id: d.id,
        week: data.week,
        status: data.status || "pending",
        grade: data.grade ?? null,
        totalPossible: data.totalPossible ?? null,
        letterGrade: data.letterGrade ?? null,
        createTime: d.createTime?.toMillis() || 0,
        videos: videos.filter((v) => v && v.url),
        urls: urls.filter(Boolean),
        attachments: attachments.filter((a) => a && a.url),
      };
    })
    .sort((a, b) => Number(a.week) - Number(b.week));

  const rosterName = [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Student";

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/students"
        style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
      >
        &larr; Back to students
      </Link>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginTop: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          {student.firstName} {student.lastName}
        </h1>
        {student.username && (
          <span style={{ fontFamily: "monospace", color: "var(--muted)", fontSize: "0.9rem" }}>
            @{student.username}
          </span>
        )}
        {student.email && (
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {student.email}
          </span>
        )}
        <span style={s.badgeStyle(bioTrim ? "graded" : "pending")}>
          Bio: {bioTrim ? "ready" : "NA"}
        </span>
        <span style={s.badgeStyle(hasSurvey ? "graded" : "pending")}>
          Survey: {hasSurvey ? "ready" : "NA"}
        </span>
        <span style={s.badgeStyle(hasProfileSummary ? "graded" : "pending")}>
          AI profile: {hasProfileSummary ? "ready" : "—"}
        </span>
      </div>

      {/* Edit form */}
      <EditStudentForm
        studentId={id}
        initial={{
          firstName: student.firstName || "",
          lastName: student.lastName || "",
          username: student.username || "",
          email: student.email || "",
          bio: student.bio || "",
          instructorComments: student.instructorComments || "",
        }}
      />

      {/* Documents */}
      <StudentDocUpload
        studentId={id}
        documents={student.documents || []}
      />

      {/* Questionnaire (from Google Form CSV pipeline) */}
      {hasSurvey && (
        <div style={{ ...s.card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
            Questionnaire responses
          </h2>
          <div style={{ display: "grid", gap: "0.65rem", fontSize: "0.88rem" }}>
            {Object.entries(surveyMap).map(([q, a]) => (
              <div key={q} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.2rem", color: "var(--foreground)" }}>{q}</div>
                <div style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>{a || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructor AI profile summary */}
      {(student.instructorProfileSummary || student.instructorProfileSummaryError) && (
        <div style={{ ...s.card, marginBottom: "1.5rem", borderColor: student.instructorProfileSummaryError ? "var(--danger)" : undefined }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
            Instructor profile summary (AI)
          </h2>
          {student.instructorProfileSummaryError && (
            <pre style={{ color: "var(--danger)", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
              {String(student.instructorProfileSummaryError)}
            </pre>
          )}
          {student.instructorProfileSummary && (
            <div style={{ lineHeight: 1.7, whiteSpace: "pre-wrap", fontSize: "0.9rem", color: "var(--muted)" }}>
              {student.instructorProfileSummary}
            </div>
          )}
        </div>
      )}

      {/* Homework files (ByteScale URLs) + ingest */}
      <div style={{ ...s.card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
          Homework files
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 1rem" }}>
          Items are grouped by week. Select a video to play inline (when the browser supports the format). PDFs and text open
          in a new tab; their text is merged with the transcript for AI grading.
        </p>
        <StudentHomeworkVideos
          submissions={submissions.map((sub) => ({
            submissionId: sub.id,
            week: sub.week,
            status: sub.status,
            videos: sub.videos.map((v) => ({ name: v.name, url: v.url! })),
            urls: sub.urls,
            attachments: sub.attachments.map((a) => ({
              name: a.name,
              url: a.url!,
              mimeType: a.mimeType,
            })),
          }))}
        />
        <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
            Submit homework (admin)
          </h3>
          <HomeworkIngestForm studentId={id} defaultStudentName={rosterName} />
        </div>
        <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
            Tab capture (Yuja / LMS)
          </h3>
          <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
            Open the dedicated workspace for segment status, ByteScale links, and pipeline progress. This student is pre-selectable
            via the link below.
          </p>
          <Link
            href={`/admin/homework-capture?student=${encodeURIComponent(id)}`}
            style={{ fontSize: "0.88rem", color: "var(--accent)", fontWeight: 500 }}
          >
            Open tab capture for this student →
          </Link>
        </div>
      </div>

      {/* Submissions history */}
      <div style={{ ...s.card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
          Homework Submissions
        </h2>

        {submissions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No submissions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Week</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Grade</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td style={s.td}>{sub.week}</td>
                    <td style={s.td}>
                      <span style={s.badgeStyle(sub.status)}>
                        {sub.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={s.td}>
                      {sub.grade != null
                        ? `${sub.grade}/${sub.totalPossible} (${sub.letterGrade})`
                        : "—"}
                    </td>
                    <td style={s.td}>
                      <Link href={`/admin/submissions/${sub.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete */}
      <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
        <DeleteStudentButton studentId={id} />
      </div>
    </>
  );
}
