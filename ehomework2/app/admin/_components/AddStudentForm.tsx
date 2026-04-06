"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function AddStudentForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, username, email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add student");
        return;
      }

      setFirstName("");
      setLastName("");
      setUsername("");
      setEmail("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={s.btnPrimary}>
        + Add Student
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Add Student
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
            First Name *
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            style={s.input}
            placeholder="Jane"
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
            Last Name *
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            style={s.input}
            placeholder="Doe"
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={s.input}
            placeholder="doej1"
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={s.input}
            placeholder="jane.doe@university.edu"
          />
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Adding..." : "Add Student"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={s.btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
