"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as s from "@/lib/admin-styles";

export type SubmissionVideoRow = {
  submissionId: string;
  week: string | number;
  status: string;
  videos: { name?: string; url: string }[];
  urls: string[];
  attachments?: { name?: string; url: string; mimeType?: string }[];
};

type PlaylistItem = {
  submissionId: string;
  week: string | number;
  label: string;
  url: string;
  kind: "video" | "document";
  mimeType?: string;
};

function flattenVideos(rows: SubmissionVideoRow[]): PlaylistItem[] {
  const out: PlaylistItem[] = [];
  for (const sub of rows) {
    let n = 0;
    for (const v of sub.videos || []) {
      if (v?.url) {
        n += 1;
        out.push({
          submissionId: sub.submissionId,
          week: sub.week,
          label: v.name?.trim() || `Video ${n}`,
          url: v.url,
          kind: "video",
        });
      }
    }
    for (const u of sub.urls || []) {
      if (u) {
        n += 1;
        out.push({
          submissionId: sub.submissionId,
          week: sub.week,
          label: `URL ${n}`,
          url: u,
          kind: "video",
        });
      }
    }
    let docIdx = 0;
    for (const a of sub.attachments || []) {
      if (a?.url) {
        docIdx += 1;
        out.push({
          submissionId: sub.submissionId,
          week: sub.week,
          label: a.name?.trim() || `Document ${docIdx}`,
          url: a.url,
          kind: "document",
          mimeType: a.mimeType,
        });
      }
    }
  }
  out.sort((a, b) => Number(a.week) - Number(b.week));
  return out;
}

function groupByWeek(items: PlaylistItem[]): Map<string, PlaylistItem[]> {
  const m = new Map<string, PlaylistItem[]>();
  for (const it of items) {
    const key = String(it.week);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(it);
  }
  return new Map([...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
}

export default function StudentHomeworkVideos({ submissions }: { submissions: SubmissionVideoRow[] }) {
  const items = useMemo(() => flattenVideos(submissions), [submissions]);
  const byWeek = useMemo(() => groupByWeek(items), [items]);
  const [selected, setSelected] = useState<PlaylistItem | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (!prev) return items[0];
      const still = items.find((i) => i.url === prev.url && i.submissionId === prev.submissionId);
      return still ?? items[0];
    });
  }, [items]);

  if (items.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
        No homework files on file yet. Use <strong>Submit homework</strong> below to upload videos, PDFs, or text, or paste
        links (stored on ByteScale first).
      </p>
    );
  }

  return (
    <div>
      <div
        style={{
          marginBottom: "1.25rem",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface-elevated, rgba(0,0,0,0.25))",
          minHeight: "220px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          selected.kind === "video" ? (
            <video
              key={selected.url}
              controls
              playsInline
              preload="metadata"
              style={{ width: "100%", maxHeight: "min(70vh, 520px)", verticalAlign: "middle" }}
              src={selected.url}
            >
              Your browser cannot play this URL inline.{" "}
              <a href={selected.url} target="_blank" rel="noopener noreferrer">
                Open video
              </a>
            </video>
          ) : (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "0.9rem",
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: "0 0 0.75rem" }}>
                PDF or text — text is extracted for grading alongside the video transcript.
              </p>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                Open file in new tab
              </a>
            </div>
          )
        ) : (
          <p style={{ color: "var(--muted)", padding: "2rem" }}>Select an item below</p>
        )}
      </div>

      {selected && (
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "-0.5rem 0 1rem" }}>
          Week {selected.week} — {selected.label}{" "}
          <Link href={`/admin/submissions/${selected.submissionId}`} style={{ color: "var(--accent)" }}>
            Open submission
          </Link>
        </p>
      )}

      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Files by week</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[...byWeek.entries()].map(([week, list]) => (
          <div key={week}>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
              Week {week}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {list.map((it, idx) => {
                const active = selected?.url === it.url && selected?.submissionId === it.submissionId;
                return (
                  <button
                    key={`${it.submissionId}-${it.url}-${idx}`}
                    type="button"
                    onClick={() => setSelected(it)}
                    style={{
                      ...s.btnGhost,
                      fontSize: "0.78rem",
                      padding: "0.35rem 0.65rem",
                      borderColor: active ? "var(--accent)" : undefined,
                      color: active ? "var(--accent)" : undefined,
                    }}
                  >
                    {it.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
