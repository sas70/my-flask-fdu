import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "instructorPreferences";
const DOC_ID = "default";

// Upload a document with a category
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const category = formData.get("category") as string;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // Upload to ByteScale
    const BYTESCALE_ACCOUNT_ID = process.env.BYTESCALE_ACCOUNT_ID || "W142iTh";
    const BYTESCALE_SECRET_KEY = process.env.SECRET_BYTESCALE_API_KEY;
    const uploadUrl = `https://api.bytescale.com/v2/accounts/${BYTESCALE_ACCOUNT_ID}/uploads/binary`;

    const fileBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BYTESCALE_SECRET_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "X-Upload-Metadata": JSON.stringify({ fileName: `instructor/${category}/${file.name}` }),
      },
      body: Buffer.from(fileBuffer),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`ByteScale upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadResult = await uploadRes.json();
    const fileUrl = uploadResult.fileUrl;

    // Add to documents array in Firestore
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(DOC_ID);

    const docEntry = {
      name: file.name,
      url: fileUrl,
      category,
      uploadedAt: new Date().toISOString(),
    };

    await ref.set(
      { documents: FieldValue.arrayUnion(docEntry) },
      { merge: true }
    );

    return NextResponse.json({ ok: true, document: docEntry }, { status: 201 });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}

// Delete a document by URL
export async function DELETE(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection(COLLECTION).doc(DOC_ID);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const documents = (doc.data()?.documents || []) as Array<{ url: string }>;
    const filtered = documents.filter((d) => d.url !== url);

    await ref.update({ documents: filtered });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
