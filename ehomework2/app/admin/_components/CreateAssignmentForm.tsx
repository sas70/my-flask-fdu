"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

export default function CreateAssignmentForm() {
  const [week, setWeek] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    setError("");

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `assignments/week${week || "0"}`);

        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || `Failed to upload ${file.name}`);
          continue;
        }

        const uploaded = await res.json();
        setFiles((prev) => [...prev, uploaded]);
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeFile(url: string) {
    setFiles((prev) => prev.filter((f) => f.url !== url));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: Number(week),
          title,
          description,
          files,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create assignment");
        return;
      }

      setWeek("");
      setTitle("");
      setDescription("");
      setFiles([]);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          style={{ ...s.textarea, minHeight: "8rem" }}
          placeholder="Assignment instructions and requirements..."
        />

        <label style={{ padding: "0.6rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>Files</label>
        <div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ fontSize: "0.85rem", color: "var(--muted)" }}
            />
            {uploading && (
              <span style={{ fontSize: "0.8rem", color: "var(--warning)" }}>Uploading...</span>
            )}
          </div>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              {files.map((f) => (
                <div
                  key={f.url}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0.75rem",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    marginBottom: "0.5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ marginRight: "0.5rem" }}>
                      {f.name}
                    </a>
                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                      {formatSize(f.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.url)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                {files.length} file{files.length !== 1 ? "s" : ""} attached
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "1rem" }}>
        <button
          type="submit"
          disabled={loading || uploading}
          style={{ ...s.btnPrimary, opacity: loading || uploading ? 0.7 : 1 }}
        >
          {loading ? "Creating..." : "Create Assignment"}
        </button>
      </div>
    </form>
  );
}
