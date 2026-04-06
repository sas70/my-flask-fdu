"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function CreateAssignmentForm() {
  const [week, setWeek] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: Number(week), title, description }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create assignment");
        return;
      }

      setWeek("");
      setTitle("");
      setDescription("");
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
        Create Assignment
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Creating an assignment triggers automatic rubric generation via Cloud Functions.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "6rem 1fr", gap: "0.75rem", alignItems: "start" }}>
        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Week</label>
        <input
          type="number"
          min="1"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          required
          style={{ ...s.input, maxWidth: "8rem" }}
          placeholder="e.g. 5"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={s.input}
          placeholder="e.g. Lists and Loops"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={s.textarea}
          placeholder="Assignment instructions and requirements..."
        />
      </div>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "1rem" }}>
        <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Creating..." : "Create Assignment"}
        </button>
      </div>
    </form>
  );
}
