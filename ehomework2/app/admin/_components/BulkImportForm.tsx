"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

interface ImportResult {
  firstName: string;
  lastName: string;
  status: string;
}

export default function BulkImportForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{
    created: number;
    skipped: number;
    total: number;
    results: ImportResult[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResults(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a CSV file");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/students/bulk", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      setResults(data);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={s.btnGhost}>
        Import CSV
      </button>
    );
  }

  return (
    <div style={{ ...s.card, marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
        Bulk Import Students
      </h3>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0 0 1rem 0" }}>
        Upload a CSV or tab-separated file with columns: <code>Last Name, First Name, Username</code> (header row required).
        Students with duplicate usernames will be skipped.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            style={{ fontSize: "0.85rem", color: "var(--muted)" }}
          />
          <button type="submit" disabled={loading} style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Importing..." : "Import"}
          </button>
          <button type="button" onClick={() => { setOpen(false); setResults(null); }} style={s.btnGhost}>
            Cancel
          </button>
        </div>
      </form>

      {error && (
        <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}

      {results && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
            <span style={{ color: "var(--success)" }}>{results.created} created</span>
            {results.skipped > 0 && (
              <span style={{ color: "var(--warning)", marginLeft: "1rem" }}>
                {results.skipped} skipped
              </span>
            )}
            <span style={{ color: "var(--muted)", marginLeft: "1rem" }}>
              ({results.total} total)
            </span>
          </p>

          {results.results.some((r) => r.status !== "created") && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)" }}>
                Show details
              </summary>
              <div style={{ marginTop: "0.5rem", maxHeight: "12rem", overflow: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((r, i) => (
                      <tr key={i}>
                        <td style={s.td}>{r.firstName} {r.lastName}</td>
                        <td style={s.td}>
                          <span style={s.badgeStyle(r.status === "created" ? "graded" : "pending")}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
