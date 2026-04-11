"use client";

import { useState, useEffect } from "react";
import * as s from "@/lib/admin-styles";

interface Profile {
  name: string;
  email: string;
  dept: string;
  courseName: string;
  bio: string;
  notes: string;
}

export default function ProfileForm() {
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    dept: "",
    courseName: "",
    bio: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile({
          name: data.name || "",
          email: data.email || "",
          dept: data.dept || "",
          courseName: data.courseName || "",
          bio: data.bio || "",
          notes: data.notes || "",
        });
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });

    if (res.ok) {
      setMessage("Saved");
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage("Failed to save");
    }
    setSaving(false);
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading profile...</p>;

  return (
    <form onSubmit={handleSave} style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Instructor Profile
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        This information is passed to the AI when generating rubrics and grading.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "8rem 1fr", gap: "0.75rem", alignItems: "start" }}>
        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Name</label>
        <input
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          style={s.input}
          placeholder="Dr. Jane Smith"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Email</label>
        <input
          type="email"
          value={profile.email}
          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          style={s.input}
          placeholder="jane@university.edu"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Department</label>
        <input
          value={profile.dept}
          onChange={(e) => setProfile({ ...profile, dept: e.target.value })}
          style={s.input}
          placeholder="Computer Science"
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Course name</label>
        <div>
          <input
            value={profile.courseName}
            onChange={(e) => setProfile({ ...profile, courseName: e.target.value })}
            style={s.input}
            placeholder="CS 101 — Introduction to Programming"
          />
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
            Shown at the top of student-facing grading report PDFs. You can also set{" "}
            <code style={{ fontSize: "0.7rem" }}>NEXT_PUBLIC_HOMEWORK_COURSE_NAME</code> in the environment.
          </p>
        </div>

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Bio</label>
        <textarea
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          style={s.textarea}
          placeholder="Brief background, teaching style, expertise..."
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          General Guidance
        </label>
        <textarea
          value={profile.notes}
          onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
          style={{ ...s.textarea, minHeight: "8rem" }}
          placeholder="General grading philosophy, course-wide instructions for the AI, any preferences for tone, strictness, focus areas..."
        />
      </div>

      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <button type="submit" disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Save Profile"}
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
