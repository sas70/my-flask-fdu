"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function EditDiscussionForm({
  discussionId,
  initialWeek,
  initialTitle,
  initialPromptText,
}: {
  discussionId: string;
  initialWeek: number;
  initialTitle: string;
  initialPromptText: string;
}) {
  const [week, setWeek] = useState(String(initialWeek));
  const [title, setTitle] = useState(initialTitle);
  const [promptText, setPromptText] = useState(initialPromptText);
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!promptText.trim() && (!files || files.length === 0)) {
      setError("Provide either prompt text or upload a prompt file (or both).");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("week", week);
      formData.append("title", title);
      formData.append("promptText", promptText);

      if (files) {
        for (let i = 0; i < files.length; i++) {
          formData.append("promptFiles", files[i]);
        }
      }

      const res = await fetch(`/api/admin/discussions/${discussionId}`, {
        method: "PATCH",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        console.warn("[EditDiscussionForm] PATCH failed", res.status, data);
        setError(data.error || "Failed to save");
        return;
      }

      console.info("[EditDiscussionForm] discussion updated", { discussionId });
      setFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.push(`/admin/discussions/${discussionId}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Edit discussion
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Changes save to Firestore. If you change the prompt, use{" "}
        <strong>Retry Rubric Generation</strong> on the detail page when the rubric should be
        regenerated.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "7rem 1fr",
          gap: "0.75rem",
          alignItems: "start",
        }}
      >
        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Week</label>
        <input
          type="number"
          min="1"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          required
          style={{ ...s.input, maxWidth: "8rem" }}
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={s.input}
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          Prompt text
        </label>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          style={s.textarea}
          placeholder="Discussion prompt..."
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          Add file
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.doc,.docx"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          style={{ fontSize: "0.85rem", color: "var(--muted)" }}
        />
      </div>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.75rem 0 0", fontSize: "0.85rem" }}>{error}</p>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
