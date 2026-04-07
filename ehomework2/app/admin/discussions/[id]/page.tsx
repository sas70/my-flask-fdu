import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import RetryDiscussionButton from "../../_components/RetryDiscussionButton";

export const dynamic = "force-dynamic";

export default async function DiscussionPromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.collection("discussions").doc(id).get();

  if (!doc.exists) {
    notFound();
  }

  const disc = doc.data()!;
  const rubricBusy =
    disc.status === "rubric_generating" || disc.status === "analyzing";
  const showRubricAction = !rubricBusy;
  const rubricActionLabel =
    disc.status === "rubric_failed"
      ? "Retry Rubric Generation"
      : disc.rubric
        ? "Regenerate rubric"
        : "Generate rubric";

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/discussions"
        style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
      >
        &larr; Back to discussion prompts
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
          {disc.title || `Week ${disc.week} Discussion`}
        </h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Week {disc.week}
        </span>
        <span style={s.badgeStyle(
          disc.rubric ? "graded"
            : disc.status?.includes("fail") ? "grading_failed"
            : disc.status?.includes("generating") ? "grading"
            : "pending"
        )}>
          {disc.rubric ? "rubric ready" : (disc.status || "pending").replace(/_/g, " ")}
        </span>
        <Link
          href={`/admin/discussions/${id}/edit`}
          style={{
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Edit
        </Link>
      </div>

      {/* Generate / retry / regenerate rubric (sets status → retry_rubric; Cloud Function runs) */}
      {showRubricAction && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
            Rubric is created by a Cloud Function. Use this if the prompt is new, stuck on
            pending, failed, or you edited the prompt and need a fresh rubric.
          </p>
          <RetryDiscussionButton
            discussionId={id}
            action="retry_rubric"
            label={rubricActionLabel}
          />
        </div>
      )}

      {rubricBusy && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Rubric pipeline is running… refresh in a moment.
        </p>
      )}

      {/* Error from Cloud Function (rubric or analysis) */}
      {disc.error && (
        <div style={{ ...s.card, borderColor: "var(--danger)", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--danger)" }}>
            Pipeline error ({String(disc.status || "").replace(/_/g, " ")})
          </h2>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "var(--muted)" }}>
            {disc.error}
          </pre>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.5 }}>
            Your terminal only shows that this app updated Firestore. The rubric runs in{" "}
            <strong>Firebase Cloud Functions</strong>. If you see API or auth errors above, set secrets on
            the function: <code style={{ fontSize: "0.75rem" }}>ANTHROPIC_API_KEY</code>,{" "}
            <code style={{ fontSize: "0.75rem" }}>SECRET_BYTESCALE_API_KEY</code>, then redeploy. Check{" "}
            <strong>Firebase Console → Functions → Logs</strong> for <code>onDiscussionUpdated</code>.
          </p>
        </div>
      )}

      {/* Discussion prompt */}
      <div style={{ ...s.card, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.75rem" }}>
          Prompt
        </h2>
        <pre style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          fontSize: "0.85rem",
          lineHeight: 1.5,
          color: "var(--muted)",
          maxHeight: "30rem",
          overflow: "auto",
        }}>
          {disc.promptText}
        </pre>
      </div>

      {/* Rubric preview */}
      {disc.rubric && (
        <details style={{ ...s.card, marginBottom: "1.5rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
            Generated Rubric
          </summary>
          <pre style={{
            marginTop: "1rem",
            whiteSpace: "pre-wrap",
            fontSize: "0.8rem",
            lineHeight: 1.4,
            color: "var(--muted)",
            maxHeight: "25rem",
            overflow: "auto",
          }}>
            {JSON.stringify(disc.rubric, null, 2)}
          </pre>
        </details>
      )}

      {/* Links */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
        {disc.rubricUrl && (
          <a href={disc.rubricUrl} target="_blank" rel="noopener noreferrer">
            Rubric JSON
          </a>
        )}
        {disc.rubric && (
          <Link href={`/admin/responses/${id}`}>
            Go to Responses &rarr;
          </Link>
        )}
      </div>
    </>
  );
}
