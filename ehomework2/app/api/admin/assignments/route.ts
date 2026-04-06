import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("assignments").orderBy("week", "desc").get();

    const assignments = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.createTime?.toDate().toISOString() || null,
    }));

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Assignments GET error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week, title, description } = body;

    if (!week || !title) {
      return NextResponse.json(
        { error: "week and title are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const doc = {
      week: Number(week),
      title,
      description: description || "",
      files: [],
    };

    const ref = await db.collection("assignments").add(doc);

    return NextResponse.json({ id: ref.id, ...doc }, { status: 201 });
  } catch (error) {
    console.error("Assignments POST error:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}
