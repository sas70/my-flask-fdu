import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import CreateAssignmentForm from "../_components/CreateAssignmentForm";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const db = getDb();
  const snap = await db.collection("assignments").orderBy("week", "desc").get();

  const assignments = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      week: d.week,
      title: d.title || `Week ${d.week}`,
      description: d.description || "",
      hasRubric: !!d.rubric,
      rubricError: d.rubricError || null,
      filesCount: (d.files || []).length,
      createdAt: doc.createTime?.toDate().toISOString() || null,
    };
  });

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Assignments
      </h1>

      <CreateAssignmentForm />

      <div style={s.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
          All Assignments
        </h2>

        {assignments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No assignments yet. Create one above.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Week</th>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>Files</th>
                  <th style={s.th}>Rubric</th>
                  <th style={s.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td style={s.td}>{a.week}</td>
                    <td style={s.td}>{a.title}</td>
                    <td style={s.td}>
                      {a.filesCount > 0 ? (
                        <span style={{ fontSize: "0.85rem" }}>{a.filesCount}</span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>0</span>
                      )}
                    </td>
                    <td style={s.td}>
                      {a.rubricError ? (
                        <span style={s.badgeStyle("grading_failed")}>error</span>
                      ) : a.hasRubric ? (
                        <span style={s.badgeStyle("graded")}>generated</span>
                      ) : (
                        <span style={s.badgeStyle("pending")}>pending</span>
                      )}
                    </td>
                    <td style={{ ...s.td, color: "var(--muted)", fontSize: "0.8rem" }}>
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
