/**
 * Fetch ByteScale (or any HTTPS) files and extract plain text for PDF, plain text,
 * Python (.py), and Jupyter/Colab notebooks (.ipynb — cell sources flattened).
 */
const pdfParse = require("pdf-parse");

function isVideoMimeType(mime, name) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("video/")) return true;
  const n = (name || "").toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi|mkv|mpeg|mpg)$/.test(n);
}

function isPdfMimeType(mime, name) {
  const m = (mime || "").toLowerCase();
  if (m === "application/pdf") return true;
  return (name || "").toLowerCase().endsWith(".pdf");
}

function isIpynbMimeType(mime, name) {
  const m = (mime || "").toLowerCase();
  if (m === "application/x-ipynb+json") return true;
  return (name || "").toLowerCase().endsWith(".ipynb");
}

function isTextMimeType(mime, name) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("text/") || m === "application/json") return true;
  if (m === "text/x-python" || m === "application/x-python") return true;
  const n = (name || "").toLowerCase();
  return /\.(txt|md|csv|log|json|rtf|py)$/.test(n);
}

function guessMimeFromName(name) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".txt") || n.endsWith(".md")) return "text/plain";
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".ipynb")) return "application/x-ipynb+json";
  if (n.endsWith(".py")) return "text/x-python";
  return "";
}

/**
 * Jupyter/Colab .ipynb: flatten code + markdown cell sources into plain text for grading.
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractTextFromIpynb(buffer) {
  let obj;
  try {
    obj = JSON.parse(buffer.toString("utf8"));
  } catch (e) {
    throw new Error(`Invalid notebook JSON (${e.message})`);
  }
  if (!obj || !Array.isArray(obj.cells)) {
    return buffer.toString("utf8").trim();
  }
  const parts = [];
  obj.cells.forEach((cell, i) => {
    const type = cell.cell_type || "cell";
    let src = cell.source;
    if (Array.isArray(src)) src = src.join("");
    else if (typeof src !== "string") src = "";
    const t = src.trim();
    if (!t) return;
    parts.push(`### ${type} [${i + 1}]\n${t}`);
  });
  return parts.join("\n\n").trim();
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} fileName
 * @returns {Promise<string>}
 */
async function extractTextFromBuffer(buffer, mimeType, fileName) {
  const mt = mimeType || guessMimeFromName(fileName);
  if (isIpynbMimeType(mt, fileName)) {
    return extractTextFromIpynb(buffer);
  }
  if (isPdfMimeType(mt, fileName)) {
    const data = await pdfParse(buffer);
    return (data.text || "").trim();
  }
  if (isTextMimeType(mt, fileName)) {
    return buffer.toString("utf8").trim();
  }
  throw new Error(`Unsupported type for text extraction: ${fileName} (${mt || "unknown MIME"})`);
}

async function fetchUrlBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url.slice(0, 80)} (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

module.exports = {
  isVideoMimeType,
  isPdfMimeType,
  isIpynbMimeType,
  isTextMimeType,
  guessMimeFromName,
  extractTextFromIpynb,
  extractTextFromBuffer,
  fetchUrlBytes,
};
