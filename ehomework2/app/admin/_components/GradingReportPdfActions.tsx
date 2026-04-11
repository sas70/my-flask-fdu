"use client";

import { useState } from "react";
import * as s from "@/lib/admin-styles";

function safeFileBase(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 64) || "student";
}

type Props = {
  /** Element whose inner layout is rendered into the PDF (must exist in the DOM). */
  elementId: string;
  submissionId: string;
  studentName?: string;
};

function buildFilename(studentName: string | undefined, submissionId: string) {
  const base = safeFileBase(studentName || "student");
  const shortId = submissionId.slice(0, 8);
  return `grading-report_${base}_${shortId}.pdf`;
}

/** Scroll target into view so html2canvas does not clip content above the viewport (e.g. letterhead). */
async function prepareReportNodeForPdfCapture(el: HTMLElement) {
  el.scrollIntoView({ block: "start", behavior: "auto" });
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * html2canvas often used the viewport height and missed the top of a tall element when the page
 * was scrolled. Pin scroll offsets and pass the element's full scroll size so letterhead + report
 * are always included in Download / Upload PDF / Open PDF.
 */
function pdfOptionsForElement(el: HTMLElement, filename: string) {
  const h = Math.max(el.scrollHeight, el.offsetHeight, 1);
  const w = Math.max(el.scrollWidth, el.offsetWidth, 1);
  return {
    margin: [12, 12, 12, 12],
    filename,
    image: { type: "jpeg" as const, quality: 0.92 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: -window.scrollY,
      /** Match full report + letterhead height so capture is not limited to the viewport. */
      windowWidth: w,
      windowHeight: h,
    },
    jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  } as Record<string, unknown>;
}

/**
 * html2pdf.js: same layout as the page, for download or ByteScale upload.
 */
export default function GradingReportPdfActions({ elementId, submissionId, studentName }: Props) {
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const disabled = busy !== null;

  async function handleDownload() {
    const el = document.getElementById(elementId);
    if (!el) {
      setError("Report content not found.");
      return;
    }
    setError("");
    setShareUrl(null);
    setBusy("download");
    try {
      await prepareReportNodeForPdfCapture(el);
      const html2pdf = (await import("html2pdf.js")).default;
      const filename = buildFilename(studentName, submissionId);
      await html2pdf().set(pdfOptionsForElement(el, filename)).from(el).save();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadShareLink() {
    const el = document.getElementById(elementId);
    if (!el) {
      setError("Report content not found.");
      return;
    }
    setError("");
    setCopied(false);
    setBusy("upload");
    try {
      await prepareReportNodeForPdfCapture(el);
      const html2pdf = (await import("html2pdf.js")).default;
      const filename = buildFilename(studentName, submissionId);
      const blob = (await html2pdf()
        .set(pdfOptionsForElement(el, filename))
        .from(el)
        .outputPdf("blob")) as Blob;
      const file = new File([blob], filename, { type: "application/pdf" });

      const form = new FormData();
      form.append("file", file);
      form.append("folder", "grading-reports");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `Upload failed (${res.status})`);
      }
      if (!data.url) {
        throw new Error("Upload succeeded but no URL was returned.");
      }
      setShareUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "42rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={disabled}
          style={{
            ...s.btnPrimary,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            ...(disabled ? { opacity: 0.75, cursor: "wait" } : {}),
          }}
        >
          {busy === "download" ? <Spinner variant="onPrimary" label="Preparing PDF…" /> : "Download PDF for student"}
        </button>
        <button
          type="button"
          onClick={() => void handleUploadShareLink()}
          disabled={disabled}
          style={{
            ...s.btnGhost,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            borderColor: "var(--accent)",
            color: "var(--accent)",
            ...(disabled ? { opacity: 0.75, cursor: "wait" } : {}),
          }}
        >
          {busy === "upload" ? <Spinner variant="accent" label="Uploading…" /> : "Upload PDF & get share link"}
        </button>
      </div>

      {shareUrl && (
        <div
          style={{
            display: "grid",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface, rgba(0,0,0,0.2))",
          }}
        >
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
            Share with student (ByteScale)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              style={{
                ...s.input,
                flex: "1 1 14rem",
                fontSize: "0.78rem",
                fontFamily: "ui-monospace, monospace",
              }}
            />
            <button type="button" onClick={() => void copyUrl()} style={{ ...s.btnGhost, fontSize: "0.82rem" }}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.82rem", color: "var(--accent)" }}
            >
              Open PDF
            </a>
          </div>
        </div>
      )}

      {error && <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>{error}</span>}
      <style>{`@keyframes gf-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Spinner({ label, variant }: { label: string; variant: "onPrimary" | "accent" }) {
  const ring =
    variant === "onPrimary"
      ? { border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff" as const }
      : { border: "2px solid rgba(88, 166, 255, 0.35)", borderTopColor: "var(--accent)" as const };
  return (
    <>
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          ...ring,
          borderRadius: "50%",
          animation: "gf-spin 0.7s linear infinite",
        }}
      />
      {label}
    </>
  );
}
