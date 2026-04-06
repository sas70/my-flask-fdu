import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

const COLLECTION = "students";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = await db.collection(COLLECTION).doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Also fetch this student's submissions
    const subsSnap = await db
      .collection("homeworkSubmissions")
      .where("studentId", "==", id)
      .get();

    const submissions = subsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        week: data.week,
        status: data.status,
        grade: data.grade ?? null,
        totalPossible: data.totalPossible ?? null,
        letterGrade: data.letterGrade ?? null,
      };
    });

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      submissions,
      createdAt: doc.createTime?.toDate().toISOString() || null,
    });
  } catch (error) {
    console.error("Student GET error:", error);
    return NextResponse.json({ error: "Failed to fetch student" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, username, email, bio, instructorComments } = body;

    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const updates: Record<string, string> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (bio !== undefined) updates.bio = bio;
    if (instructorComments !== undefined) updates.instructorComments = instructorComments;

    await ref.update(updates);

    const updated = await ref.get();
    return NextResponse.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    console.error("Student PUT error:", error);
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Student DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
