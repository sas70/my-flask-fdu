"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

interface DocEntry {
  name: string;
  url: string;
  category: string;
  uploadedAt?: string;
}

const DEFAULT_CATEGORIES = [
  "Bio",
  "Survey Response",
  "Emails",
  "Comments",
  "Instructor Comments",
];

export default function StudentDocUpload({
  studentId,
  documents: initialDocuments,
}: {
  studentId: string;
  documents: DocEntry[];
}) {
  const [documents, setDocuments] = useState<DocEntry[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const existingCategories = documents
    .map((d) => d.category)
    .filter((c, i, arr) => arr.indexOf(c) === i);
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...existingCategories])];

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a file");
      return;
    }

    const finalCategory = isCustom ? customCategory.trim() : category;
    if (!finalCategory) {
      setError("Category is required");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", finalCategory);

      const res = await fetch(`/api/admin/students/${studentId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed");
        return;
      }

      const data = await res.json();
      setDocuments([...documents, data.document]);
      if (fileRef.current) fileRef.current.value = "";
      setCustomCategory("");
      setIsCustom(false);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    const res = await fetch(`/api/admin/students/${studentId}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (res.ok) {
      setDocuments(documents.filter((d) => d.url !== url));
      router.refresh();
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
        Documents
      </h2>

      {documents.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>File</th>
                <th style={s.th}>Category</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.url}>
                  <td style={s.td}>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer">
                      {doc.name}
                    </a>
                  </td>
                  <td style={s.td}>
                    <span style={s.badgeStyle("transcribed")}>{doc.category}</span>
                  </td>
                  <td style={s.td}>
                    <button
                      onClick={() => handleDelete(doc.url)}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleUpload}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            style={{ fontSize: "0.85rem", color: "var(--muted)" }}
          />

          {!isCustom ? (
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setIsCustom(true);
                } else {
                  setCategory(e.target.value);
                }
              }}
              style={s.select}
            >
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__custom__">+ Add new category...</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="New category name"
                style={{ ...s.input, width: "12rem" }}
              />
              <button
                type="button"
                onClick={() => { setIsCustom(false); setCustomCategory(""); }}
                style={{ ...s.btnGhost, padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
              >
                Cancel
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            style={{ ...s.btnPrimary, opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
