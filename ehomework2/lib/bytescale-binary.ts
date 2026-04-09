/**
 * ByteScale BasicUpload + UploadFromUrl (same account/key as text uploads).
 * @see https://www.bytescale.com/docs/upload-api/BasicUpload
 * @see https://www.bytescale.com/docs/upload-api/UploadFromUrl
 */

function getAccountAndSecret(): { accountId: string; secret: string } {
  const accountId = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const secret = process.env.SECRET_BYTESCALE_API_KEY;
  if (!secret) {
    throw new Error("SECRET_BYTESCALE_API_KEY is not configured");
  }
  return { accountId, secret };
}

export async function uploadBinaryToBytescale(
  data: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const { accountId, secret } = getAccountAndSecret();
  const url = `https://api.bytescale.com/v2/accounts/${accountId}/uploads/binary`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": contentType || "application/octet-stream",
      "X-Upload-Metadata": JSON.stringify({ fileName }),
    },
    body: new Uint8Array(data),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale upload failed (${response.status}): ${errText}`);
  }

  const result = (await response.json()) as { fileUrl: string };
  return result.fileUrl;
}

export async function uploadFromUrlToBytescale(sourceUrl: string): Promise<string> {
  const { accountId, secret } = getAccountAndSecret();
  const url = `https://api.bytescale.com/v2/accounts/${accountId}/uploads/url`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale UploadFromUrl failed (${response.status}): ${errText}`);
  }

  const result = (await response.json()) as { fileUrl: string };
  return result.fileUrl;
}

/**
 * ByteScale UploadFromUrl fetches the URL server-side. LMS/player links (Yuja, Canvas, Panopto, etc.)
 * usually return HTML, which ByteScale rejects (unsupported_file_type / text/html).
 */
export function formatUploadFromUrlError(
  sourceUrl: string,
  error: unknown,
  role: "video" | "document"
): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const shortUrl = sourceUrl.length > 96 ? `${sourceUrl.slice(0, 96)}…` : sourceUrl;
  const looksLikeWebPage =
    lower.includes("text/html") ||
    lower.includes("unsupported_file_type") ||
    lower.includes("executable files cannot");

  if (looksLikeWebPage) {
    if (role === "video") {
      return (
        `Could not import as video (${shortUrl}): ByteScale received a web page (HTML), not a raw video file. ` +
        `Player links (Yuja, Canvas, Panopto, YouTube watch pages, etc.) open a site in the browser—` +
        `use a direct file URL if your school provides one (often ends in .mp4 or .webm), or download the recording and upload the file below.`
      );
    }
    return (
      `Could not import as document (${shortUrl}): ByteScale received a web page (HTML), not a PDF or text file. ` +
      `Use a direct link to the file, or download and upload it.`
    );
  }
  return `UploadFromUrl failed for "${shortUrl}": ${msg}`;
}
