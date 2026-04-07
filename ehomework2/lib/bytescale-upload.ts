/**
 * Server-side ByteScale upload (same API as packages/gradeflow-shared/bytescale.js).
 * Used by admin routes to store large artifacts without hitting Firestore size limits.
 */
export async function uploadTextToBytescale(
  text: string,
  fileName: string
): Promise<string> {
  const accountId = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const secret = process.env.SECRET_BYTESCALE_API_KEY;
  if (!secret) {
    throw new Error("SECRET_BYTESCALE_API_KEY is not configured");
  }

  const url = `https://api.bytescale.com/v2/accounts/${accountId}/uploads/binary`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "text/plain",
      "X-Upload-Metadata": JSON.stringify({ fileName }),
    },
    body: text,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale upload failed (${response.status}): ${errText}`);
  }

  const result = (await response.json()) as { fileUrl: string };
  return result.fileUrl;
}
