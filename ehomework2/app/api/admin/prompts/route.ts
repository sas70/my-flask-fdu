import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { DEFAULT_PROMPTS } from "@/lib/default-prompts";

const COLLECTION = "systemPrompts";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection(COLLECTION).get();

    const saved: Record<string, string> = {};
    snap.forEach((doc) => {
      saved[doc.id] = doc.data().value;
    });

    // Merge defaults with saved values
    const prompts = Object.entries(DEFAULT_PROMPTS).map(([key, meta]) => ({
      key,
      label: meta.label,
      description: meta.description,
      value: saved[key] ?? meta.defaultValue,
      isCustomized: key in saved,
    }));

    return NextResponse.json(prompts);
  } catch (error) {
    console.error("Prompts GET error:", error);
    return NextResponse.json({ error: "Failed to fetch prompts" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();

    if (!key || !DEFAULT_PROMPTS[key]) {
      return NextResponse.json({ error: "Invalid prompt key" }, { status: 400 });
    }

    const db = getDb();

    if (value === null || value === undefined) {
      // Reset to default — delete the doc
      await db.collection(COLLECTION).doc(key).delete();
      return NextResponse.json({ ok: true, reset: true });
    }

    await db.collection(COLLECTION).doc(key).set({ value, updatedAt: new Date().toISOString() });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Prompts PUT error:", error);
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
  }
}
