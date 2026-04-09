import Link from "next/link";
import { getDb } from "@/lib/firebase-admin";
import * as s from "@/lib/admin-styles";
import HomeworkBrowserCapture from "../_components/HomeworkBrowserCapture";

export const dynamic = "force-dynamic";

export default async function HomeworkCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const studentsSnap = await db.collection("students").orderBy("lastName", "asc").get();
  const ingestStudents = studentsSnap.docs.map((doc) => {
    const d = doc.data();
    const label = `${d.lastName || ""}, ${d.firstName || ""}`.trim();
    return { id: doc.id, label: label || doc.id };
  });

  const initialStudent = sp.student?.trim();
  const validInitial =
    initialStudent && ingestStudents.some((x) => x.id === initialStudent) ? initialStudent : undefined;

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/admin/submissions" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>
          ← Submissions
        </Link>
      </div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.35rem" }}>Tab capture</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1.5rem", maxWidth: "42rem", lineHeight: 1.5 }}>
        Record the browser tab while a Yuja (or other LMS) video plays. Video+audio is split into short WebM segments, uploaded
        to ByteScale, transcribed per segment when you provide a <strong>reference URL</strong> (stored in{" "}
        <code style={{ fontSize: "0.8rem" }}>yuja_funny_urls</code>), merged on finalize, then a homework submission is
        created for the same grading pipeline (Cloud Function uses the combined transcript instead of re-transcribing each WebM).
      </p>

      {ingestStudents.length > 0 ? (
        <div style={{ ...s.card, marginBottom: "1.5rem" }}>
          <HomeworkBrowserCapture students={ingestStudents} initialStudentId={validInitial} />
        </div>
      ) : (
        <p style={{ color: "var(--muted)" }}>
          Add students under <Link href="/admin/students">Manage → Students</Link> first.
        </p>
      )}
    </>
  );
}
