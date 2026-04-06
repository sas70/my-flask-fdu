import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { studentDocId } from "@/lib/student-utils";

const COLLECTION = "students";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection(COLLECTION).orderBy("lastName", "asc").get();

    const students = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.createTime?.toDate().toISOString() || null,
    }));

    return NextResponse.json(students);
  } catch (error) {
    console.error("Students GET error:", error);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, username, email, bio } = body;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "firstName and lastName are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const trimmedUsername = (username || "").trim();
    // Auto-generate email from username: username@students.wpunj.edu
    const autoEmail = trimmedUsername ? `${trimmedUsername}@students.wpunj.edu` : "";

    const docId = studentDocId(firstName, lastName);
    const ref = db.collection(COLLECTION).doc(docId);

    // merge: true so re-saving preserves existing documents & instructorComments
    await ref.set(
      {
        firstName,
        lastName,
        username: trimmedUsername,
        email: (email || "").trim() || autoEmail,
        bio: bio || "",
      },
      { merge: true }
    );

    // Ensure documents and instructorComments fields exist on first create
    const snap = await ref.get();
    const data = snap.data()!;
    if (!data.documents) await ref.update({ documents: [] });
    if (!data.instructorComments) await ref.update({ instructorComments: "" });

    return NextResponse.json({ id: docId, ...data }, { status: 201 });
  } catch (error) {
    console.error("Students POST error:", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
