# GradeFlow — Next.js + Cloud Functions

Event-driven grading pipeline for Python homework video walkthroughs. Firestore triggers run in **Firebase Cloud Functions**; shared logic lives in **`packages/gradeflow-shared`**. The **Next.js** app at the repo root is the web UI and optional API routes.

## Repository layout

| Path | Role |
| --- | --- |
| [`app/`](app/) | Next.js App Router (pages, `app/api/*`) |
| [`packages/gradeflow-shared`](packages/gradeflow-shared/) | Shared pipeline: ByteScale uploads, Gemini transcription, Claude rubric + grading, Firestore updates |
| [`functions/`](functions/) | Firebase Cloud Functions entry — Firestore triggers only; delegates to `gradeflow-shared` |
| [`scripts/predeploy-functions.js`](scripts/predeploy-functions.js) | Copies `gradeflow-shared` into `functions/packages/` and runs `npm install` in `functions/` (required for `firebase deploy` because only `functions/` is uploaded) |

## Architecture

```
Student uploads video
        │
        ▼
┌──────────────────────┐
│  homeworkSubmissions  │ ◄── Firestore collection
│  (status: "pending") │
└──────┬───────────────┘
       │ onCreate trigger
       ▼
┌──────────────────────┐
│  1. Transcribe       │ ◄── Gemini 2.0 Flash
│     Video → Text     │
└──────┬───────────────┘
       │ uploads to ByteScale
       │ updates status → "transcribed"
       ▼
┌──────────────────────┐     ┌──────────────────────┐
│  3. Grade            │ ◄── │  2. Generate Rubric  │ ◄── Claude
│     Transcription    │     │     from Assignment  │
│     vs Rubric        │     └──────────────────────┘
└──────┬───────────────┘              ▲
       │ Claude                       │ onCreate trigger
       │ updates status → "graded"    │
       ▼                     ┌────────┴───────────┐
  Grade + Feedback           │    assignments     │
  saved to Firestore         │  (week 1-7 specs)  │
  + ByteScale                └────────────────────┘
```

## Functions

| Function | Trigger | What it does |
| --- | --- | --- |
| `onSubmissionCreated` | `homeworkSubmissions` onCreate | Transcribes video via Gemini, then checks for rubric |
| `onAssignmentCreated` | `assignments` onCreate | Generates rubric via Claude, then grades any waiting |
| `onSubmissionUpdated` | `homeworkSubmissions` onUpdate | Retry handler for failed transcriptions/grading |

## Firestore collections

| Collection | Key fields |
| --- | --- |
| `students` | firstName, lastName, email, bio, files[{name, url, type}] |
| `instructorPreferences` | name, email, dept, bio, notes, documents[{name, url, category}] |
| `assignments` | week, title, description, files[], rubric{}, rubricUrl |
| `homeworkSubmissions` | studentId, studentName, week, videos[], urls[], status, grade, … |

### Submission status flow

```
pending → transcribed → grading → graded
                ↘                    ↘
         transcription_failed   grading_failed
                ↘                    ↘
         retry_transcription    retry_grading   (set manually to retry)
```

## Setup

### Prerequisites

```bash
npm install -g firebase-tools
firebase login
firebase use e-homework-project
```

### 1. Next.js (repo root)

```bash
npm install
npm run dev
# http://localhost:3000 — smoke check: GET /api/health
```

Optional: copy [`.env.example`](.env.example) to `.env.local` for local Next.js env vars (e.g. future `NEXT_PUBLIC_*` Firebase client config).

### 2. Cloud Functions

Before installing or deploying Functions, materialize the shared package into `functions/packages/gradeflow-shared`:

```bash
npm run predeploy-functions
```

Then install Functions dependencies (or rely on the script above, which runs `npm install` inside `functions/`):

```bash
cd functions && npm install
```

The `functions/packages/` directory is gitignored; run `predeploy-functions` after clone or when `packages/gradeflow-shared` changes.

### 3. Secrets (production)

Prefer Firebase secrets for API keys:

```bash
firebase functions:secrets:set GOOGLE_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set SECRET_BYTESCALE_API_KEY
```

Wire secrets to your Functions runtime in the Firebase console or `functions` source if you use `defineSecret()` (not added in this scaffold — add when you move off raw `process.env` in deployed v2 functions).

For local emulator development, use a `.env` in `functions/` or export variables in your shell (do not commit secrets).

### 4. Local emulators

```bash
npm run serve
# or: firebase emulators:start --only functions,firestore
```

### 5. Deploy

**Functions** (runs `predeploy` first, which copies shared code and installs `functions/` deps):

```bash
npm run deploy:functions
```

**Firestore rules / indexes:**

```bash
npm run deploy:firestore
# or: firebase deploy --only firestore:rules && firebase deploy --only firestore:indexes
```

**Next.js** is deployed separately (for example Vercel, Cloud Run, or [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)). It is not required for Cloud Functions to run.

## Environment variables

| Context | Where keys live |
| --- | --- |
| Next.js | `.env.local` (server and `NEXT_PUBLIC_*` for browser) |
| Cloud Functions | Firebase secrets / emulator env — `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `SECRET_BYTESCALE_API_KEY`, `BYTESCALE_ACCOUNT_ID` |

Keep `.env.local` gitignored.

## Retry failed jobs

From the Firebase console or client:

```javascript
await db.doc('homeworkSubmissions/SUBMISSION_ID').update({ status: 'retry_transcription' });
await db.doc('homeworkSubmissions/SUBMISSION_ID').update({ status: 'retry_grading' });
```

## Costs estimate (per submission)

| Service | Usage | Est. cost |
| --- | --- | --- |
| Gemini | ~30 min video | ~$0.05–0.10 |
| Claude | Rubric (once/week) | ~$0.02–0.05 |
| Claude | Grading per student | ~$0.03–0.08 |
| ByteScale | 3–4 file uploads | ~$0.001 |
| Cloud Functions | ~2 min execution | ~$0.001 |
| **Total** | **per submission** | **~$0.10–0.20** |
