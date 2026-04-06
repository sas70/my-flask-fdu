"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "@/lib/admin-styles";

export default function DeleteStudentButton({ studentId }: { studentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      router.push("/admin/students");
      router.refresh();
    }
    setLoading(false);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{ ...s.btnDanger, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
      >
        Delete Student
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <span style={{ fontSize: "0.85rem", color: "var(--danger)" }}>Are you sure?</span>
      <button
        onClick={handleDelete}
        disabled={loading}
        style={{ ...s.btnDanger, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
      >
        {loading ? "Deleting..." : "Yes, Delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        style={{ ...s.btnGhost, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
      >
        Cancel
      </button>
    </div>
  );
}
