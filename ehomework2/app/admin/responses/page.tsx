import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import UploadWeekResponsesForm from "../_components/UploadWeekResponsesForm";

export const dynamic = "force-dynamic";

export default async function DiscussionResponsesPage() {
  const db = getDb();
  const snap = await db.collection("discussions").orderBy("week", "asc").get();

  const discussions = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      week: d.week as number,
      title: (d.title || `Week ${d.week} Discussion`) as string,
      status: (d.status || "pending") as string,
      hasRubric: !!d.rubric,
      hasResponses: !!d.responsesText,
      hasInsights: !!d.insights,
      responsesFileName: (d.responsesFileName || null) as string | null,
    };
  });

  // Data for the upload form dropdown
  const weekOptions = discussions.map((d) => ({
    week: d.week,
    title: d.title,
    hasRubric: d.hasRubric,
    hasResponses: d.hasResponses,
  }));

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Discussion Responses
      </h1>

      {/* Upload form */}
      <UploadWeekResponsesForm weeks={weekOptions} />

      {/* Results table */}
      <div style={s.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
          All Weeks
        </h2>

        {discussions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No discussion prompts yet. <Link href="/admin/discussions">Create one</Link> first.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Week</th>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>Rubric</th>
                  <th style={s.th}>Responses</th>
                  <th style={s.th}>Insights</th>
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
                      {d.hasResponses ? (
                        <>
                          <span style={s.badgeStyle("graded")}>uploaded</span>
                          {d.responsesFileName && (
                            <span style={{ color: "var(--muted)", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                              {d.responsesFileName}
                            </span>
                          )}
                        </>
                      ) : d.hasRubric ? (
                        <span style={s.badgeStyle("pending")}>awaiting</span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>—</span>
                      )}
                    </td>
                    <td style={s.td}>
                      {d.hasInsights ? (
                        <span style={s.badgeStyle("graded")}>ready</span>
                      ) : d.status === "analyzing" ? (
                        <span style={s.badgeStyle("grading")}>analyzing</span>
                      ) : d.status === "analysis_failed" ? (
                        <span style={s.badgeStyle("grading_failed")}>failed</span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>—</span>
                      )}
                    </td>
                    <td style={s.td}>
                      {d.hasInsights ? (
                        <Link href={`/admin/responses/${d.id}`}>View Insights</Link>
                      ) : d.status === "analysis_failed" ? (
                        <Link href={`/admin/responses/${d.id}`}>View Error</Link>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>—</span>
                      )}
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
