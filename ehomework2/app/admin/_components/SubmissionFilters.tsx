"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as s from "@/lib/admin-styles";

const STATUSES = [
  "pending",
  "transcribing",
  "transcribed",
  "grading",
  "graded",
  "transcription_failed",
  "grading_failed",
];

export default function SubmissionFilters({ weeks }: { weeks: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentWeek = searchParams.get("week") || "";
  const currentStatus = searchParams.get("status") || "";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/admin/submissions?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
      <select
        value={currentWeek}
        onChange={(e) => update("week", e.target.value)}
        style={s.select}
      >
        <option value="">All weeks</option>
        {weeks.map((w) => (
          <option key={w} value={String(w)}>
            Week {w}
          </option>
        ))}
      </select>

      <select
        value={currentStatus}
        onChange={(e) => update("status", e.target.value)}
        style={s.select}
      >
        <option value="">All statuses</option>
        {STATUSES.map((st) => (
          <option key={st} value={st}>
            {st.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
