"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function UploadResponsesForm({
  discussionId,
}: {
  discussionId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Please select a .txt file");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("responsesFile", file);

      const res = await fetch(`/api/admin/discussions/${discussionId}/responses`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to upload responses");
        return;
      }

      const data = await res.json();
      setSuccess(`Uploaded ${data.chars.toLocaleString()} characters. Analysis will start automatically.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
        Upload Student Responses
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Upload a single .txt file with all student discussion posts and peer replies.
        Analysis will begin automatically once the rubric is ready.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          style={{ fontSize: "0.85rem", color: "var(--muted)" }}
        />
        <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Uploading..." : "Upload & Analyze"}
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ color: "var(--success)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          {success}
        </p>
      )}
    </form>
  );
}
