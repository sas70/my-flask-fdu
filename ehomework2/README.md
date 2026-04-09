# GradeFlow — Next.js + Cloud Functions

Event-driven grading pipeline for Python homework video walkthroughs. Firestore triggers run in **Firebase Cloud Functions**; shared logic lives in **`packages/gradeflow-shared`**. The **Next.js** app at the repo root is the web UI and optional API routes.

## CLoud functions
Here’s how to redeploy Cloud Functions in this repo:

firebase login --reauth 
firebase deploy --only functions

One command (recommended)
# From the project root (ehomework2):

firebase use e-homework-project   # if you’re not already on this project
npm run deploy:functions
firebase deploy --only functions runs the predeploy hook in firebase.json, which runs npm run predeploy-functions and copies packages/gradeflow-shared into functions/ before upload.

# Equivalent manual steps
npm run predeploy-functions
cd functions && npm install   # only if deps changed; predeploy often runs install already
cd ..
firebase deploy --only functions

# After changing secrets
If you rotated API keys in Secret Manager, redeploy so functions pick them up:

npm run deploy:functions


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
│  1. Transcribe       │ ◄── Gemini 2.5 Flash (optional `GEMINI_TRANSCRIPTION_MODEL`)
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
| `onDiscussionCreated` / `onDiscussionUpdated` | `discussions` | Discussion rubric + analysis pipeline ([`discussions.js`](packages/gradeflow-shared/discussions.js)) |
| `onStudentSurveyUploadCreated` | `students_survey_collection` onCreate | Parses Google Form CSV from `csvUrl`; writes one doc per row; merges questionnaire into `students` matched by **email**, else **fuzzy first+last name** ([`studentSurvey.js`](packages/gradeflow-shared/studentSurvey.js)). If the trigger never runs, admin **Survey students** can **Parse CSV on app server** (`PATCH /api/admin/student-questionnaire` with `{ "uploadId" }`) — same handler. |
| `onStudentsIntroductionUploadCreated` | `students_introduction` onCreate | Fetches intro `.txt` from `textUrl`; Claude extracts each student’s introduction; fuzzy name match → updates `students.bio` ([`studentIntroductions.js`](packages/gradeflow-shared/studentIntroductions.js)) |
| `onStudentCreated` / `onStudentUpdated` | `students` | Builds `instructorProfileSummary` when bio and/or `surveyResponses` exist (skips if both empty) |

## Firestore collections

| Collection | Key fields |
| --- | --- |
| `students` | firstName, lastName, email, bio, documents[], optional `surveyResponses`, optional `introductionSourceUploadId` / `introductionMatchScore` (bulk intro file), `instructorProfileSummary` |
| `students_survey_collection` | `csv_upload` docs (ByteScale `csvUrl`) + `survey_response` rows (`responses` map per Google Form row); uploaded from admin **Survey students** (`/admin/survey-students`). After parse: `matchedToRosterCount`, `unmatchedRowCount`, capped `matchedStudentSummary` / `unmatchedRowSummary`, optional `summaryTruncated`. Filter Cloud Logs with **`survey CSV`** for per-row match lines. |
| `students_introduction` | `introduction_text_upload` docs with ByteScale `textUrl`; admin **Students introduction** (`/admin/students-introduction`) |
| `instructorPreferences` | name, email, dept, bio, notes, documents[{name, url, category}] |
| `assignments` | week, title, description, files[], rubric{}, rubricUrl |
| `homeworkSubmissions` | studentId, studentName, week, `videos[{name,url,mimeType?}]` (ByteScale **raw** URLs), optional `attachments[{name,url,mimeType}]` for PDF, text, **`.py`**, **`.ipynb`** (also on ByteScale), optional `urls[]`, optional `referencePlaybackUrl` (Yuja/LMS link for audit), optional `captureSessionId` / `ingestSource` (e.g. `admin_browser_capture`), optional **`yujaFunnyUrlsDocId`** / **`premergedWalkthroughTranscriptionUrl`** (tab capture with reference URL: merged segment transcripts on ByteScale — Cloud Function **skips per-video Gemini** when `premergedWalkthroughTranscriptionUrl` is set), status, transcription, grade, … Create via **Homework → Submissions** or **Manage → Students → student**; `POST /api/admin/homework-ingest` (files + URLs) or **tab capture** (`/api/admin/homework-capture/session`, `…/chunk`, `…/chunk-transcribe`, `…/finalize`). `onSubmissionCreated` builds combined text (Gemini per video **unless** premerged URL exists), extracts documents, merges, then grades (Claude). |
| `homeworkCaptureSessions` | Short-lived admin-only capture: `studentId`, `week`, optional `referencePlaybackUrl`, optional `referencePlaybackUrlKey`, optional **`yujaFunnyUrlsDocId`** (links to one doc in `yuja_funny_urls` per normalized video URL), `status` (`open` \| `finalized`), subcollection `chunks` with `chunkIndex`, ByteScale `url`, `mimeType`, `name`, `uploadedAt`, **`startOffsetMs`** / **`endOffsetMs`** / **`durationMs`** (timeline relative to recording start; usually `chunkIndex × chunkLengthNominalMs` through `(chunkIndex+1) × chunkLengthNominalMs`), **`chunkLengthNominalMs`** (MediaRecorder timeslice from env at upload), optional **`durationSource`** (`nominal` \| `client` if `durationMs` was sent in multipart `FormData`). ~**1 min** WebM slices by default; override `NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS`. **Resume:** same student + week + normalized reference URL reuses an **open** session (see [`/api/admin/homework-capture/resume`](app/api/admin/homework-capture/resume/route.ts)). UI: **Homework → Tab capture** ([`/admin/homework-capture`](app/admin/homework-capture/page.tsx)). |
| `yuja_funny_urls` | **One document per normalized Yuja / LMS video URL** (`referencePlaybackUrlKey`). **New** docs use a deterministic Firestore **document id** = SHA-256 hex (UTF-8) of `referencePlaybackUrlKey` ([`referencePlaybackUrlKeyToYujaDocId`](lib/yuja-funny-urls-id.ts)); older docs may still use random ids and are found via `referencePlaybackUrlKey` query. Fields: `referencePlaybackUrl`, **`segments`** map (`chunkUrl`, `transcriptUrl` per index), optional **`combinedTranscriptionUrl`** after merge, optional **`combinedTranscriptionListenerAt`** (set by Cloud Function when combined URL is written). Merge requires **≥ ~90%** of session chunks to have segment transcripts (`ceil(n×0.9)`); omitted segments are listed in the merged text header. The merged `.txt` at `combinedTranscriptionUrl` / `premergedWalkthroughTranscriptionUrl` is **inner transcript body** (segment blocks + optional merge note); [`buildPremergedVideoSectionFromUrl`](packages/gradeflow-shared/gradeFlow.js) adds the canonical "## Video walkthrough…" wrapper when building the full grading text in Cloud Functions. Tab capture UI polls [`GET /api/admin/homework-capture/yuja-status`](app/api/admin/homework-capture/yuja-status/route.ts). **`onYujaFunnyUrlsUpdated`** (Cloud Function) runs when `combinedTranscriptionUrl` appears — syncs `homeworkSubmissions` if needed and records listener timestamp. Manual merge: [`POST /api/admin/yuja-funny-urls/merge`](app/api/admin/yuja-funny-urls/merge/route.ts). |
| `discussions` | One document per discussion week: prompt, rubric, uploaded responses, generated insights (see below) |

### `discussions` document schema

Prompts, **student responses**, and **Claude-generated insights** all live on the **same** `discussions/{discussionId}` document (not a separate collection). Use numeric `week` for filtering; the upload API accepts both number and string `week` in Firestore for compatibility.

| Area | Fields | Written by |
| --- | --- | --- |
| Prompt | `week`, `title`, `promptText`, `promptFileUrls`, `status` | Next.js admin API (`POST/PATCH` discussions), Cloud Functions on create/retry |
| Rubric | `rubric`, `rubricUrl`, `rubricGeneratedAt`, `error` | `onDiscussionCreated`, `onDiscussionUpdated` (`retry_rubric`) in [`packages/gradeflow-shared/discussions.js`](packages/gradeflow-shared/discussions.js) |
| Responses | `responsesUrl` (ByteScale), `responsesFileName`, `responsesUploadedAt`; legacy `responsesText` | Upload APIs upload the file to ByteScale and store the URL only (see [`lib/bytescale-upload.ts`](lib/bytescale-upload.ts)). Cloud Functions fetch the URL at analysis time. |
| Insights | `insights`, `insightsUrl`, `analyzedAt`, `error` | `runDiscussionAnalysis` in [`discussions.js`](packages/gradeflow-shared/discussions.js) — full JSON in Firestore **and** a copy uploaded to ByteScale (`insightsUrl`) |

**Discussion status flow (high level):**

```
pending → rubric_generating → rubric_ready
                ↘ rubric_failed
                     ↑ retry_rubric

rubric_ready + (`responsesUrl` or `responsesText`) → analyzing → analyzed
                                  ↘ analysis_failed
                                       ↑ retry_analysis
```

Analysis runs when responses are present (`responsesUrl` or legacy `responsesText`) and the rubric is ready (either right after rubric generation if responses were already uploaded, or on the next update when responses arrive).

**Next.js admin uploads** need `SECRET_BYTESCALE_API_KEY` (and optional `BYTESCALE_ACCOUNT_ID`) in `.env.local` so response files can be uploaded to ByteScale from API routes.

**Document size:** Firestore documents are limited to roughly **1 MiB**. Discussion responses are stored on ByteScale (`responsesUrl`), not inline. Large `insights` still lives in Firestore alongside `insightsUrl`; if writes fail, trim inline `insights` or rely on `insightsUrl` only. Types live in [`lib/types/discussion.ts`](lib/types/discussion.ts).

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

**If pasting into the terminal fails** (long keys, special characters, or the prompt eats input), read the value from a **file** or **stdin** instead:

```bash
# From a one-line text file you create (keep these files out of git)
firebase functions:secrets:set GOOGLE_API_KEY --data-file ~/Downloads/google_api_key.txt
firebase functions:secrets:set SECRET_BYTESCALE_API_KEY --data-file ~/Downloads/bytescale_secret.txt

# Or from stdin (paste once, press Ctrl+D on a new line to finish)
firebase functions:secrets:set SECRET_BYTESCALE_API_KEY --data-file -
```

[`functions/index.js`](functions/index.js) binds those names with `defineSecret()` and `setGlobalOptions({ secrets: [...] })` so `process.env.ANTHROPIC_API_KEY` (and the others) are set at runtime. After setting or rotating a secret, **redeploy functions**.

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

**Firestore rules / indexes** (required after pulling changes that add new indexes, e.g. `students_survey_collection`):

```bash
npm run deploy:firestore
# or: firebase deploy --only firestore:rules && firebase deploy --only firestore:indexes
```

**Next.js** is deployed separately (for example Vercel, Cloud Run, or [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)). It is not required for Cloud Functions to run.

## Environment variables

| Context | Where keys live |
| --- | --- |
| Next.js | `.env.local` (server and `NEXT_PUBLIC_*` for browser). Include `SECRET_BYTESCALE_API_KEY` (and optional `BYTESCALE_ACCOUNT_ID`) for admin uploads to ByteScale (discussion responses, student questionnaire CSV, instructor documents). For **tab capture segment transcription** ([`/api/admin/homework-capture/chunk-transcribe`](app/api/admin/homework-capture/chunk-transcribe/route.ts)), also set **`GOOGLE_API_KEY`** (and optional **`GEMINI_TRANSCRIPTION_MODEL`**) — same key as Cloud Functions Gemini. |
| Cloud Functions | Firebase secrets / emulator env — `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `SECRET_BYTESCALE_API_KEY`, `BYTESCALE_ACCOUNT_ID`. Optional: `GEMINI_TRANSCRIPTION_MODEL` (defaults to `gemini-2.5-flash` in [`gradeFlow.js`](packages/gradeflow-shared/gradeFlow.js)). |

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
