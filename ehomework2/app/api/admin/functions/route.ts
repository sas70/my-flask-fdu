import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(process.cwd());

// The functions we define in our codebase
const DEFINED_FUNCTIONS = [
  {
    name: "onSubmissionCreated",
    trigger: "homeworkSubmissions/{id} — onCreate",
    description:
      "Builds combined grading text (Gemini per video unless premergedWalkthroughTranscriptionUrl from tab capture), then grades if rubric exists",
  },
  {
    name: "onAssignmentCreated",
    trigger: "assignments/{id} — onCreate",
    description: "Generates HW grading rubric via Claude",
  },
  {
    name: "onSubmissionUpdated",
    trigger: "homeworkSubmissions/{id} — onUpdate",
    description: "Retries failed transcription or grading",
  },
  {
    name: "onYujaFunnyUrlsUpdated",
    trigger: "yuja_funny_urls/{docId} — onUpdate",
    description: "When combined transcript URL is set; syncs submission premerge if needed, audit timestamp",
  },
  {
    name: "onDiscussionCreated",
    trigger: "discussions/{id} — onCreate",
    description: "Generates discussion rubric via Claude",
  },
  {
    name: "onDiscussionUpdated",
    trigger: "discussions/{id} — onUpdate",
    description: "Analyzes responses when rubric + responses are ready; handles retries",
  },
];

export async function GET() {
  try {
    // Try to get deployed function status from Firebase
    const deployedStatus: Record<string, string> = {};

    try {
      const { stdout } = await execAsync(
        "firebase functions:list --json 2>/dev/null || echo '[]'",
        { cwd: PROJECT_ROOT, timeout: 15000 }
      );
      const parsed = JSON.parse(stdout.trim() || "[]");
      if (Array.isArray(parsed)) {
        for (const fn of parsed) {
          const name = fn.id || fn.name || "";
          const shortName = name.split("/").pop() || name;
          deployedStatus[shortName] = fn.state || fn.status || "ACTIVE";
        }
      }
    } catch {
      // firebase CLI not available or not logged in — that's ok
    }

    const functions = DEFINED_FUNCTIONS.map((fn) => ({
      ...fn,
      deployed: deployedStatus[fn.name] || null,
    }));

    return NextResponse.json({
      functions,
      projectRoot: PROJECT_ROOT,
    });
  } catch (error) {
    console.error("Functions list error:", error);
    return NextResponse.json({ error: "Failed to list functions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === "deploy") {
      // Run predeploy (copies shared package) then deploy
      const { stdout, stderr } = await execAsync(
        "npm run predeploy-functions && npm run deploy:functions",
        {
          cwd: PROJECT_ROOT,
          timeout: 300000, // 5 minutes
          env: { ...process.env, PATH: process.env.PATH + ":/usr/local/bin:/opt/homebrew/bin" },
        }
      );

      return NextResponse.json({
        ok: true,
        stdout: stdout.substring(0, 10000),
        stderr: stderr.substring(0, 5000),
      });
    }

    if (action === "predeploy") {
      // Just copy shared package + install deps (no deploy)
      const { stdout, stderr } = await execAsync(
        "npm run predeploy-functions",
        {
          cwd: PROJECT_ROOT,
          timeout: 120000,
          env: { ...process.env, PATH: process.env.PATH + ":/usr/local/bin:/opt/homebrew/bin" },
        }
      );

      return NextResponse.json({
        ok: true,
        stdout: stdout.substring(0, 10000),
        stderr: stderr.substring(0, 5000),
      });
    }

    if (action === "deploy-firestore") {
      const { stdout, stderr } = await execAsync(
        "npm run deploy:firestore",
        {
          cwd: PROJECT_ROOT,
          timeout: 120000,
          env: { ...process.env, PATH: process.env.PATH + ":/usr/local/bin:/opt/homebrew/bin" },
        }
      );

      return NextResponse.json({
        ok: true,
        stdout: stdout.substring(0, 10000),
        stderr: stderr.substring(0, 5000),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    console.error("Deploy error:", error);
    return NextResponse.json({
      error: "Deployment failed",
      stdout: err.stdout?.substring(0, 10000) || "",
      stderr: err.stderr?.substring(0, 5000) || "",
      message: err.message || "",
    }, { status: 500 });
  }
}
