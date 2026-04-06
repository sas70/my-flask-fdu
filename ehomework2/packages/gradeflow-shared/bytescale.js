/**
 * Upload files to ByteScale (server-side secret key).
 */
async function uploadTextToBytescale(text, fileName) {
  const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
  const url = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/binary`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
      "Content-Type": "text/plain",
      "X-Upload-Metadata": JSON.stringify({ fileName }),
    },
    body: text,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale upload failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.fileUrl;
}

async function uploadJsonToBytescale(data, fileName) {
  const text = JSON.stringify(data, null, 2);
  const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
  const url = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/binary`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
      "Content-Type": "application/json",
      "X-Upload-Metadata": JSON.stringify({ fileName }),
    },
    body: text,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale upload failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.fileUrl;
}

module.exports = { uploadTextToBytescale, uploadJsonToBytescale };
