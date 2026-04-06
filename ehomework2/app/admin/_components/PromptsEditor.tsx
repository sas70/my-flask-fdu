"use client";

import { useState, useEffect } from "react";
import * as s from "@/lib/admin-styles";

interface PromptEntry {
  key: string;
  label: string;
  description: string;
  value: string;
  isCustomized: boolean;
}

export default function PromptsEditor() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/prompts")
      .then((r) => r.json())
      .then((data) => {
        setPrompts(data);
        setLoading(false);
      });
  }, []);

  function startEdit(prompt: PromptEntry) {
    setEditing(prompt.key);
    setEditValue(prompt.value);
    setMessage("");
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue("");
    setMessage("");
  }

  async function savePrompt(key: string) {
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: editValue }),
    });

    if (res.ok) {
      setPrompts(
        prompts.map((p) =>
          p.key === key ? { ...p, value: editValue, isCustomized: true } : p
        )
      );
      setEditing(null);
      setMessage(`${key} saved`);
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage("Failed to save");
    }
    setSaving(false);
  }

  async function resetPrompt(key: string) {
    setSaving(true);

    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: null }),
    });

    if (res.ok) {
      // Reload to get defaults
      const refreshRes = await fetch("/api/admin/prompts");
      const data = await refreshRes.json();
      setPrompts(data);
      setEditing(null);
      setMessage(`${key} reset to default`);
      setTimeout(() => setMessage(""), 2000);
    }
    setSaving(false);
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading prompts...</p>;

  return (
    <div style={{ ...s.card, marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
        AI Prompts
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
        Customize the prompts sent to AI models. Use {"{{placeholders}}"} for dynamic values.
        Changes apply to all future processing.
      </p>

      {message && (
        <p style={{ color: "var(--success)", fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
          {message}
        </p>
      )}

      {prompts.map((prompt) => (
        <div
          key={prompt.key}
          style={{
            borderBottom: "1px solid var(--border)",
            paddingBottom: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>
              {prompt.label}
            </h3>
            {prompt.isCustomized && (
              <span style={{
                fontSize: "0.7rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
                background: "var(--accent)",
                color: "#fff",
              }}>
                customized
              </span>
            )}
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.25rem 0 0.75rem" }}>
            {prompt.description}
          </p>

          {editing === prompt.key ? (
            <>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                style={{
                  ...s.textarea,
                  minHeight: "14rem",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  onClick={() => savePrompt(prompt.key)}
                  disabled={saving}
                  style={{ ...s.btnPrimary, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={cancelEdit}
                  style={{ ...s.btnGhost, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                >
                  Cancel
                </button>
                {prompt.isCustomized && (
                  <button
                    onClick={() => resetPrompt(prompt.key)}
                    disabled={saving}
                    style={{ ...s.btnDanger, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.75rem",
                  lineHeight: 1.4,
                  color: "var(--muted)",
                  maxHeight: "8rem",
                  overflow: "auto",
                  cursor: "pointer",
                }}
                onClick={() => startEdit(prompt)}
                title="Click to edit"
              >
                {prompt.value.substring(0, 500)}
                {prompt.value.length > 500 ? "..." : ""}
              </pre>
              <button
                onClick={() => startEdit(prompt)}
                style={{
                  ...s.btnGhost,
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.6rem",
                  marginTop: "0.5rem",
                }}
              >
                Edit
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
