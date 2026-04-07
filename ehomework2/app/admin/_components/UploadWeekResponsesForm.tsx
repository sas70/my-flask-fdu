"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

interface WeekOption {
  week: number;
  title: string;
  hasRubric: boolean;
  hasResponses: boolean;
}

export default function UploadWeekResponsesForm({
  weeks,
}: {
  weeks: WeekOption[];
}) {
  const [selectedWeek, setSelectedWeek] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const selectedInfo = weeks.find((w) => String(w.week) === selectedWeek);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedWeek) {
      setError("Select a week");
      return;
    }

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a .txt file with student responses");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("week", selectedWeek);
      formData.append("responsesFile", file);

      const res = await fetch("/api/admin/responses", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to upload responses");
        return;
      }

      setSuccess(
        `Uploaded ${data.chars.toLocaleString()} characters for Week ${data.week} "${data.title}". ` +
        (selectedInfo?.hasRubric
          ? "Analysis will start automatically."
          : "Responses saved. Analysis will start once the rubric is ready.")
      );
      setSelectedWeek("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
        Upload Student Responses
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Select a week and upload a .txt file with all student discussion posts and peer replies.
        You can upload responses at any time — analysis runs automatically once both the rubric and responses are ready.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedWeek}
          onChange={(e) => { setSelectedWeek(e.target.value); setError(""); setSuccess(""); }}
          style={s.select}
        >
          <option value="">Select week...</option>
          {weeks.map((w) => (
            <option key={w.week} value={String(w.week)}>
              Week {w.week} — {w.title}
              {w.hasResponses ? " (re-upload)" : ""}
            </option>
          ))}
        </select>

        <input
          ref={fileRef}
          type="file"
          accept=".txt"
        />

        <button
          type="submit"
          disabled={loading}
          style={{ ...s.btnPrimary, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Uploading..." : "Upload & Analyze"}
        </button>
      </div>

      {selectedInfo && !selectedInfo.hasRubric && (
        <p style={{ color: "var(--accent)", margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
          Rubric for Week {selectedInfo.week} is still generating — you can upload responses now.
          Analysis will start automatically once the rubric is ready.
        </p>
      )}

      {weeks.length === 0 && (
        <p style={{ color: "var(--muted)", margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
          No discussion prompts created yet. Create one under Discussion Prompts first.
        </p>
      )}

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
