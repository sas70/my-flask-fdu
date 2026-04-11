import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

const COLLECTION = "instructorPreferences";
const DOC_ID = "default";

export async function GET() {
  try {
    const db = getDb();
    const doc = await db.collection(COLLECTION).doc(DOC_ID).get();

    if (!doc.exists) {
      return NextResponse.json({
        name: "",
        email: "",
        dept: "",
        /** Shown on student-facing grading report PDFs; optional. */
        courseName: "",
        bio: "",
        notes: "",
        documents: [],
      });
    }

    return NextResponse.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, dept, courseName, bio, notes } = body;

    const db = getDb();
    const ref = db.collection(COLLECTION).doc(DOC_ID);

    await ref.set(
      {
        name: name || "",
        email: email || "",
        dept: dept || "",
        courseName: typeof courseName === "string" ? courseName : "",
        bio: bio || "",
        notes: notes || "",
      },
      { merge: true }
    );

    const updated = await ref.get();
    return NextResponse.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error("Profile PUT error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
