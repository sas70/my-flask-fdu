"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

interface StudentData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  bio: string;
  instructorComments: string;
}

export default function EditStudentForm({
  studentId,
  initial,
}: {
  studentId: string;
  initial: StudentData;
}) {
  const [data, setData] = useState<StudentData>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setMessage("Saved");
      setTimeout(() => setMessage(""), 2000);
      router.refresh();
    } else {
      setMessage("Failed to save");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} style={{ ...s.card, marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Student Info
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "9rem 1fr", gap: "0.75rem", alignItems: "start" }}>
        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>First Name</label>
        <input
          value={data.firstName}
          onChange={(e) => setData({ ...data, firstName: e.target.value })}
          style={s.input}
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Last Name</label>
        <input
          value={data.lastName}
          onChange={(e) => setData({ ...data, lastName: e.target.value })}
          style={s.input}
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Username</label>
        <input
          value={data.username}
          onChange={(e) => setData({ ...data, username: e.target.value })}
          style={s.input}
          placeholder="doej1"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Email</label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
          style={s.input}
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Bio</label>
        <textarea
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          style={s.textarea}
          placeholder="Student background, interests..."
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          Instructor Comments
        </label>
        <textarea
          value={data.instructorComments}
          onChange={(e) => setData({ ...data, instructorComments: e.target.value })}
          style={{ ...s.textarea, minHeight: "6rem" }}
          placeholder="Your private notes about this student..."
        />
      </div>

      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <button type="submit" disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Save"}
        </button>
        {message && (
          <span style={{ color: message === "Saved" ? "var(--success)" : "var(--danger)", fontSize: "0.85rem" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
