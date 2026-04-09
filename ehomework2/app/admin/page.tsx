import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import { getStudentProfileFlags } from "@/lib/student-profile-flags";
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

  const studentTotal = studentsSnap.size;
  let withBio = 0;
  let withSurvey = 0;
  let withAiProfile = 0;
  let withAiError = 0;
  let withIntroFile = 0;
  let awaitingAiProfile = 0;
  let attachedDocs = 0;

  studentsSnap.forEach((doc) => {
    const d = doc.data();
    const f = getStudentProfileFlags(d);
    if (f.hasBio) withBio += 1;
    if (f.hasSurvey) withSurvey += 1;
    if (f.hasProfileSummary) withAiProfile += 1;
    if (f.hasProfileError) withAiError += 1;
    if (f.hasIntroFromUpload) withIntroFile += 1;
    if (f.awaitingProfileSummary) awaitingAiProfile += 1;
    attachedDocs += Array.isArray(d.documents) ? d.documents.length : 0;
  });

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
          <div style={s.statNumber}>{studentTotal}</div>
          <div style={s.statLabel}>Students</div>
          <Link
            href="/admin/students"
            style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: "0.5rem", display: "inline-block" }}
          >
            Manage roster →
          </Link>
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

      {/* Student profiles: bio, questionnaire, AI summaries, introductions */}
      <div style={{ ...s.card, marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.35rem" }}>
          Student profiles &amp; AI
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0 0 1.25rem" }}>
          Counts match the <Link href="/admin/students">Students</Link> table. Bios can be edited per student or bulk-imported via{" "}
          <Link href="/admin/students-introduction">Students introduction</Link>. Questionnaires come from{" "}
          <Link href="/admin/survey-students">Survey students</Link>. The Cloud Function{" "}
          <code style={{ fontSize: "0.72rem" }}>onStudentUpdated</code> builds instructor-facing{" "}
          <strong>AI profile</strong> summaries when a student has a bio and/or matched survey data.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div style={{ ...s.statNumber, fontSize: "1.35rem" }}>{withBio}</div>
            <div style={s.statLabel}>With bio</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              of {studentTotal}
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div style={{ ...s.statNumber, fontSize: "1.35rem", color: "var(--accent)" }}>{withSurvey}</div>
            <div style={s.statLabel}>Questionnaire</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              survey matched
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div style={{ ...s.statNumber, fontSize: "1.35rem", color: "var(--success)" }}>{withAiProfile}</div>
            <div style={s.statLabel}>AI profile</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              instructor summary
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div
              style={{
                ...s.statNumber,
                fontSize: "1.35rem",
                color: withAiError > 0 ? "var(--danger)" : "var(--muted)",
              }}
            >
              {withAiError}
            </div>
            <div style={s.statLabel}>AI errors</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              summary failed
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div style={{ ...s.statNumber, fontSize: "1.35rem" }}>{withIntroFile}</div>
            <div style={s.statLabel}>Intro file</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              bulk upload
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div
              style={{
                ...s.statNumber,
                fontSize: "1.35rem",
                color: awaitingAiProfile > 0 ? "var(--warning)" : "var(--muted)",
              }}
            >
              {awaitingAiProfile}
            </div>
            <div style={s.statLabel}>Awaiting AI</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              bio/survey, no summary yet
            </div>
          </div>
          <div style={{ ...s.statCard, padding: "1rem", textAlign: "center" }}>
            <div style={{ ...s.statNumber, fontSize: "1.35rem" }}>{attachedDocs}</div>
            <div style={s.statLabel}>Attached files</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              on student records
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <Link href="/admin/students" style={{ ...s.btnGhost, fontSize: "0.8rem", textDecoration: "none" }}>
            Students
          </Link>
          <Link href="/admin/survey-students" style={{ ...s.btnGhost, fontSize: "0.8rem", textDecoration: "none" }}>
            Survey students
          </Link>
          <Link
            href="/admin/students-introduction"
            style={{ ...s.btnGhost, fontSize: "0.8rem", textDecoration: "none" }}
          >
            Students introduction
          </Link>
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
