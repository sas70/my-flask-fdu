import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

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

    const doc = {
      firstName,
      lastName,
      username: username || "",
      email: email || "",
      bio: bio || "",
      documents: [],
      instructorComments: "",
    };

    const ref = await db.collection(COLLECTION).add(doc);

    return NextResponse.json({ id: ref.id, ...doc }, { status: 201 });
  } catch (error) {
    console.error("Students POST error:", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
