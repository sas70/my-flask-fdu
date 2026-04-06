import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = getDb();

  const [assignmentsSnap, submissionsSnap, discussionsSnap, studentsSnap] = await Promise.all([
    db.collection("assignments").get(),
    db.collection("homeworkSubmissions").get(),
    db.collection("discussions").get(),
    db.collection("students").get(),
  ]);

  const byStatus: Record<string, number> = {};
  const recent: Array<{
    id: string;
    studentName: string;
    week: string;
    status: string;
    grade?: number;
    letterGrade?: string;
    createTime: number;
  }> = [];

  submissionsSnap.forEach((doc) => {
    const d = doc.data();
    const status = d.status || "pending";
    byStatus[status] = (byStatus[status] || 0) + 1;
    recent.push({
      id: doc.id,
      studentName: d.studentName || "Unknown",
      week: d.week,
      status,
      grade: d.grade,
      letterGrade: d.letterGrade,
      createTime: doc.createTime?.toMillis() || 0,
    });
  });

  recent.sort((a, b) => b.createTime - a.createTime);
  const recentList = recent.slice(0, 10);

  const totalSubmissions = submissionsSnap.size;
  const graded = byStatus["graded"] || 0;
  const failed = (byStatus["transcription_failed"] || 0) + (byStatus["grading_failed"] || 0);
  const inProgress =
    (byStatus["pending"] || 0) +
    (byStatus["transcribed"] || 0) +
    (byStatus["grading"] || 0);

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Dashboard
      </h1>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={s.statCard}>
          <div style={s.statNumber}>{studentsSnap.size}</div>
          <div style={s.statLabel}>Students</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statNumber}>{assignmentsSnap.size}</div>
          <div style={s.statLabel}>Assignments</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statNumber}>{totalSubmissions}</div>
          <div style={s.statLabel}>Submissions</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statNumber, color: "var(--success)" }}>{graded}</div>
          <div style={s.statLabel}>Graded</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statNumber, color: "var(--warning)" }}>{inProgress}</div>
          <div style={s.statLabel}>In Progress</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statNumber, color: failed > 0 ? "var(--danger)" : "var(--muted)" }}>{failed}</div>
          <div style={s.statLabel}>Failed</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statNumber, color: "var(--accent)" }}>{discussionsSnap.size}</div>
          <div style={s.statLabel}>Discussions</div>
        </div>
      </div>

      {/* Status breakdown */}
      {Object.keys(byStatus).length > 0 && (
        <div style={{ ...s.card, marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
            Status Breakdown
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={s.badgeStyle(status)}>{status.replace(/_/g, " ")}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div style={s.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
          Recent Submissions
        </h2>
        {recentList.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No submissions yet.</p>
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
                {recentList.map((sub) => (
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
                        ? `${sub.grade} (${sub.letterGrade})`
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
    </>
  );
}
