import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import CreateDiscussionForm from "../_components/CreateDiscussionForm";

export const dynamic = "force-dynamic";

const discussionStatusColors: Record<string, string> = {
  pending: "pending",
  rubric_generating: "grading",
  rubric_ready: "transcribed",
  analyzing: "grading",
  analyzed: "graded",
  rubric_failed: "grading_failed",
  analysis_failed: "grading_failed",
};

export default async function DiscussionsPage() {
  const db = getDb();
  const snap = await db.collection("discussions").orderBy("week", "desc").get();

  const discussions = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      week: d.week,
      title: d.title || `Week ${d.week} Discussion`,
      status: d.status || "pending",
      hasRubric: !!d.rubric,
      hasResponses: !!d.responsesText,
      hasInsights: !!d.insights,
      createdAt: doc.createTime?.toDate().toISOString() || null,
    };
  });

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Discussion Prompts
      </h1>

      <CreateDiscussionForm />

      <div style={s.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
          All Discussion Prompts
        </h2>

        {discussions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No discussion prompts yet. Create one above.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Week</th>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>Rubric</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {discussions.map((d) => (
                  <tr key={d.id}>
                    <td style={s.td}>{d.week}</td>
                    <td style={s.td}>{d.title}</td>
                    <td style={s.td}>
                      {d.hasRubric ? (
                        <span style={s.badgeStyle("graded")}>ready</span>
                      ) : (
                        <span style={s.badgeStyle("pending")}>pending</span>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={s.badgeStyle(discussionStatusColors[d.status] || "pending")}>
                        {d.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ display: "inline-flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <Link href={`/admin/discussions/${d.id}`}>View</Link>
                        <Link href={`/admin/discussions/${d.id}/edit`}>Edit</Link>
                      </span>
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
