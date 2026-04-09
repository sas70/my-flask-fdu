"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function RetryButton({
  submissionId,
  action,
  label,
}: {
  submissionId: string;
  action: "retry_transcription" | "retry_grading";
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleRetry() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/retry`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        router.refresh();
        return;
      }
      setError(
        typeof data.error === "string" ? data.error : res.status === 401 ? "Not signed in" : `Failed (${res.status})`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.35rem" }}>
      <button
        type="button"
        onClick={handleRetry}
        disabled={loading}
        style={{ ...s.btnDanger, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Retrying..." : label}
      </button>
      {error && (
        <span style={{ fontSize: "0.75rem", color: "var(--danger)" }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
