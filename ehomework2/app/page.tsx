import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "42rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        GradeFlow
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Event-driven grading for Python homework video walkthroughs. Firestore triggers run in
        Firebase Cloud Functions; this site is the Next.js front end.
      </p>
      <ul style={{ paddingLeft: "1.25rem", color: "var(--muted)" }}>
        <li>
          <code>homeworkSubmissions</code> onCreate &rarr; transcribe (Gemini) &rarr; grade when rubric exists
        </li>
        <li>
          <code>assignments</code> onCreate &rarr; rubric (Claude) &rarr; grade waiting submissions
        </li>
        <li>
          <code>homeworkSubmissions</code> onUpdate &rarr; retry transcription or grading
        </li>
      </ul>
      <p style={{ marginTop: "2rem", fontSize: "0.9rem", display: "flex", gap: "1.5rem" }}>
        <a href="/api/health">API health</a>
        <Link href="/admin">Admin dashboard</Link>
      </p>
    </main>
  );
}
