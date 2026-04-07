import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/firebase-admin";
import EditDiscussionForm from "../../../_components/EditDiscussionForm";

export const dynamic = "force-dynamic";

export default async function EditDiscussionPage({
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

  const d = doc.data()!;

  return (
    <>
      <Link
        href="/admin/discussions"
        style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}
      >
        &larr; Back to discussion prompts
      </Link>
      <Link
        href={`/admin/discussions/${id}`}
        style={{
          color: "var(--muted)",
          fontSize: "0.85rem",
          textDecoration: "none",
          marginLeft: "1rem",
        }}
      >
        View discussion
      </Link>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "1rem 0 0" }}>Edit prompt</h1>

      <EditDiscussionForm
        discussionId={id}
        initialWeek={typeof d.week === "number" ? d.week : Number(d.week) || 1}
        initialTitle={(d.title as string) || `Week ${d.week} Discussion`}
        initialPromptText={(d.promptText as string) || ""}
      />
    </>
  );
}
