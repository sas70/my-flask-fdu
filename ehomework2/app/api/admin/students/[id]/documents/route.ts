import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "students";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

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
        "X-Upload-Metadata": JSON.stringify({
          fileName: `students/${id}/${category}/${file.name}`,
        }),
      },
      body: Buffer.from(fileBuffer),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`ByteScale upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadResult = await uploadRes.json();
    const fileUrl = uploadResult.fileUrl;

    const docEntry = {
      name: file.name,
      url: fileUrl,
      category,
      uploadedAt: new Date().toISOString(),
    };

    await ref.update({ documents: FieldValue.arrayUnion(docEntry) });

    return NextResponse.json({ ok: true, document: docEntry }, { status: 201 });
  } catch (error) {
    console.error("Student document upload error:", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const documents = (doc.data()?.documents || []) as Array<{ url: string }>;
    const filtered = documents.filter((d) => d.url !== url);

    await ref.update({ documents: filtered });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Student document delete error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
