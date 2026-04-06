import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import AddStudentForm from "../_components/AddStudentForm";
import BulkImportForm from "../_components/BulkImportForm";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const db = getDb();
  const snap = await db.collection("students").orderBy("lastName", "asc").get();

  const students = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      firstName: d.firstName || "",
      lastName: d.lastName || "",
      username: d.username || "",
      email: d.email || "",
      documentsCount: (d.documents || []).length,
    };
  });

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Students
      </h1>

      {/* Actions bar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <AddStudentForm />
        <BulkImportForm />
      </div>

      {/* Students table */}
      <div style={s.card}>
        {students.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No students yet. Add one above or import from CSV.
          </p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>Username</th>
                    <th style={s.th}>Email</th>
                    <th style={s.th}>Docs</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => (
                    <tr key={st.id}>
                      <td style={s.td}>
                        {st.lastName}, {st.firstName}
                      </td>
                      <td style={{ ...s.td, fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {st.username || "—"}
                      </td>
                      <td style={{ ...s.td, color: "var(--muted)", fontSize: "0.85rem" }}>
                        {st.email || "—"}
                      </td>
                      <td style={s.td}>
                        {st.documentsCount > 0 ? (
                          <span style={s.badgeStyle("transcribed")}>
                            {st.documentsCount}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>0</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <Link href={`/admin/students/${st.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "1rem", marginBottom: 0 }}>
              {students.length} student{students.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </>
  );
}
