"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function RetryDiscussionButton({
  discussionId,
  action,
  label,
}: {
  discussionId: string;
  action: "retry_rubric" | "retry_analysis";
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRetry() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/discussions/${discussionId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRetry}
      disabled={loading}
      style={{ ...s.btnDanger, opacity: loading ? 0.7 : 1 }}
    >
      {loading ? "Retrying..." : label}
    </button>
  );
}
