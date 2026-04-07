import { NextRequest, NextResponse } from "next/server";

/**
 * Generic file upload to ByteScale.
 * Accepts multipart/form-data with a "file" field and optional "folder" field.
 * Returns { name, url, type, size }.
 * Used by assignment forms, discussion forms, etc. to upload files instantly
 * before the parent form is submitted.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "uploads";

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
    const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
    const uploadUrl = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/binary`;

    const fileBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "X-Upload-Metadata": JSON.stringify({
          fileName: `${folder}/${file.name}`,
        }),
      },
      body: Buffer.from(fileBuffer),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`ByteScale upload failed (${uploadRes.status}): ${errText}`);
    }

    const result = await uploadRes.json();

    return NextResponse.json({
      name: file.name,
      url: result.fileUrl,
      type: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
