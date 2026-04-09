/** Align with packages/gradeflow-shared/documentExtract.js */

export type HomeworkFileKind = "video" | "document";

export function classifyUploadedFile(contentType: string, fileName: string): HomeworkFileKind | "reject" {
  const ct = (contentType || "").toLowerCase();
  const n = (fileName || "").toLowerCase();

  if (ct.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv|mpeg|mpg)$/.test(n)) {
    return "video";
  }
  if (ct === "application/pdf" || n.endsWith(".pdf")) {
    return "document";
  }
  if (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/x-ipynb+json" ||
    /\.(txt|md|csv|json|log|py|ipynb)$/.test(n)
  ) {
    return "document";
  }
  return "reject";
}

export function classifyPastedUrl(url: string): "video" | "document" | "unknown" {
  const path = url.split("?")[0]?.toLowerCase() || "";
  if (/\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/.test(path)) return "video";
  if (path.endsWith(".pdf")) return "document";
  if (/\.(txt|md|csv|json|py|ipynb)(\?|$)/.test(path)) return "document";
  return "unknown";
}

export function guessMimeFromFileName(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".md")) return "text/plain";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".ipynb")) return "application/x-ipynb+json";
  if (n.endsWith(".py")) return "text/x-python";
  return "";
}
