import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import EditStudentForm from "../../_components/EditStudentForm";
import StudentDocUpload from "../../_components/StudentDocUpload";
import DeleteStudentButton from "../../_components/DeleteStudentButton";

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

  // Fetch this student's submissions
  const subsSnap = await db
    .collection("homeworkSubmissions")
    .where("studentId", "==", id)
    .get();

  const submissions = subsSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        week: data.week,
        status: data.status || "pending",
        grade: data.grade ?? null,
        totalPossible: data.totalPossible ?? null,
        letterGrade: data.letterGrade ?? null,
        createTime: d.createTime?.toMillis() || 0,
      };
    })
    .sort((a, b) => Number(a.week) - Number(b.week));

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
