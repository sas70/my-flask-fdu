"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import * as s from "@/lib/admin-styles";
import type { StudentFeedbackReturn } from "@/lib/student-feedback-payload";

type Props = {
  submissionId: string;
  /** If already generated on the server */
  existingToken?: string;
  /** Full URL for students (same origin + path) */
  existingInviteUrl?: string;
  /** Prior student submission (from server, no Firestore types) */
  feedbackReturn?: {
    submittedAtIso: string | null;
    payload: StudentFeedbackReturn | null;
  };
};

export default function SubmissionStudentFeedbackPanel({
  submissionId,
  existingToken,
  existingInviteUrl,
  feedbackReturn,
}: Props) {
  const [inviteUrl, setInviteUrl] = useState(existingInviteUrl || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function ensureLink() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/feedback-invite`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        return;
      }
      if (data.url) setInviteUrl(data.url);
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Could not copy");
    }
  }

  return (
    <div id="student-feedback-invite" style={{ ...s.card, marginBottom: "1.5rem", scrollMarginTop: "1rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginTop: 0, marginBottom: "0.5rem" }}>
        Student feedback on this report
      </h2>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 1rem", lineHeight: 1.5 }}>
        Generate a private link (no login). The student sees the same grading content as your formatted report and
        can type optional responses under each section, then submit them back to you.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => void ensureLink()}
          disabled={busy}
          style={{ ...s.btnPrimary, opacity: busy ? 0.75 : 1 }}
        >
          {busy ? "Creating…" : existingToken || inviteUrl ? "Regenerate link" : "Create student feedback link"}
        </button>
        {(existingInviteUrl || inviteUrl) && (
          <>
            <input
              readOnly
              value={inviteUrl || existingInviteUrl || ""}
              onFocus={(e) => e.target.select()}
              style={{ ...s.input, flex: "1 1 16rem", fontSize: "0.78rem", fontFamily: "ui-monospace, monospace" }}
            />
            <button type="button" onClick={() => void copyLink()} style={{ ...s.btnGhost, fontSize: "0.82rem" }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>{err}</p>}

      {feedbackReturn?.payload && (
        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <h3 style={{ fontSize: "0.88rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Latest student submission
            {feedbackReturn.submittedAtIso ? (
              <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.8rem" }}>
                {" "}
                — {feedbackReturn.submittedAtIso}
              </span>
            ) : null}
          </h3>
          <FeedbackReturnBody payload={feedbackReturn.payload} />
        </div>
      )}
    </div>
  );
}

function FeedbackReturnBody({ payload }: { payload: StudentFeedbackReturn }) {
  const blocks: ReactNode[] = [];
  payload.categoryReplies.forEach((text, i) => {
    if (!text.trim()) return;
    blocks.push(
      <div key={`c-${i}`} style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Category {i + 1}</div>
        <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
    );
  });
  payload.overallParagraphReplies.forEach((text, i) => {
    if (!text.trim()) return;
    blocks.push(
      <div key={`o-${i}`} style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
          Overall feedback — part {i + 1}
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
    );
  });
  payload.strengthItemReplies.forEach((text, i) => {
    if (!text.trim()) return;
    blocks.push(
      <div key={`s-${i}`} style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Strength {i + 1}</div>
        <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
    );
  });
  payload.areaItemReplies.forEach((text, i) => {
    if (!text.trim()) return;
    blocks.push(
      <div key={`a-${i}`} style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Area {i + 1}</div>
        <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
    );
  });
  if (payload.generalComment.trim()) {
    blocks.push(
      <div key="g" style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>General</div>
        <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{payload.generalComment}</p>
      </div>
    );
  }

  if (blocks.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>(No written responses in last submit.)</p>;
  }

  return <div style={{ maxHeight: "24rem", overflow: "auto" }}>{blocks}</div>;
}
