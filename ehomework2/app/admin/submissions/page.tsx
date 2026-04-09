import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import SubmissionFilters from "../_components/SubmissionFilters";
import HomeworkIngestForm from "../_components/HomeworkIngestForm";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; status?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();

  // Get distinct weeks for the filter dropdown
  const assignmentsSnap = await db.collection("assignments").orderBy("week", "asc").get();
  const weeks = assignmentsSnap.docs.map((doc) => doc.data().week as number);

  const studentsSnap = await db.collection("students").orderBy("lastName", "asc").get();
  const ingestStudents = studentsSnap.docs.map((doc) => {
    const d = doc.data();
    const label = `${d.lastName || ""}, ${d.firstName || ""}`.trim();
    return { id: doc.id, label: label || doc.id };
  });

  // Build query
  let query: FirebaseFirestore.Query = db.collection("homeworkSubmissions");

  if (params.week) {
    query = query.where("week", "==", params.week);
  }
  if (params.status) {
    query = query.where("status", "==", params.status);
  }

  const snap = await query.get();

  const submissions = snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        studentName: d.studentName || "Unknown",
        week: d.week,
        status: d.status || "pending",
        grade: d.grade ?? null,
        totalPossible: d.totalPossible ?? null,
        letterGrade: d.letterGrade ?? null,
        createTime: doc.createTime?.toMillis() || 0,
      };
    })
    .sort((a, b) => b.createTime - a.createTime);

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Submissions
      </h1>

      <div style={{ ...s.card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
          New homework submission
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          Select a student, enter the <strong>assignment week</strong>, then add videos and/or documents (files or URLs).
          <strong> Video URLs</strong> must point to a <strong>raw video file</strong> (e.g. .mp4)—not Yuja/Canvas/YouTube
          player pages (those return HTML and cannot be imported). Prefer uploading the downloaded file. Everything is stored on
          ByteScale first; the Cloud Function transcribes video, extracts documents, and grades when the rubric exists. For{" "}
          <strong>Yuja / LMS playback</strong>, use{" "}
          <Link href="/admin/homework-capture" style={{ color: "var(--accent)" }}>
            Homework → Tab capture
          </Link>{" "}
          (segment table + pipeline status).
        </p>
        {ingestStudents.length > 0 ? (
          <HomeworkIngestForm students={ingestStudents} />
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>Add students under Manage → Students before submitting homework.</p>
        )}
      </div>

      <Suspense fallback={null}>
        <SubmissionFilters weeks={weeks} />
      </Suspense>

      <div style={s.card}>
        {submissions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No submissions found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Student</th>
                  <th style={s.th}>Week</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Grade</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td style={s.td}>{sub.studentName}</td>
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
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "1rem", marginBottom: 0 }}>
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </p>
      </div>
    </>
  );
}
