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

/**
 * Upload arbitrary bytes (e.g. video) via BasicUpload binary endpoint.
 * @param {Buffer|Uint8Array} body
 * @param {string} fileName
 * @param {string} contentType e.g. video/mp4
 */
async function uploadBinaryToBytescale(body, fileName, contentType) {
  const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
  const url = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/binary`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
      "Content-Type": contentType || "application/octet-stream",
      "X-Upload-Metadata": JSON.stringify({ fileName }),
    },
    body: Buffer.isBuffer(body) ? body : Buffer.from(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale upload failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.fileUrl;
}

/**
 * Bytescale fetches the remote URL and stores the file (UploadFromUrl API).
 * @param {string} sourceUrl
 */
async function uploadFromUrlToBytescale(sourceUrl) {
  const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
  const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
  const url = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/url`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ByteScale UploadFromUrl failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.fileUrl;
}

module.exports = {
  uploadTextToBytescale,
  uploadJsonToBytescale,
  uploadBinaryToBytescale,
  uploadFromUrlToBytescale,
};
