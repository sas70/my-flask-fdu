# Hearing Aid eBay Image Composer

Next.js app to upload product photos, crop items (manually or via AI through a Flask backend), arrange them on a canvas, and download a listing image.

## AI crop (Flask)

The **Crop** button sends the **original file** as multipart to `POST /api/detect-proxy`, which forwards the same `FormData` to Flask **`POST /api/detect`**.

### Multipart request (primary)

Form fields sent by the app:

| Field | Value |
|-------|--------|
| `file` | The image `File` (filename preserved) |
| `upscale` | `true` |
| `bytescale` | `true` |

Ensure your Flask route reads the upload under the field name **`file`** (change the client in `onAiCropForSource` if your API uses another name, e.g. `image`).

### Success response (JSON)

The app understands the merged detection payload, including:

| Field | Use |
|-------|-----|
| `ok` | Must be true |
| `upscaled_urls` | Ordered list of crop URLs (paired with `bboxes` / `crops` by index) |
| `bboxes` | `[{ x, y, width, height }, …]` in **source image pixel space**, same order as crops |
| `crops` | `[{ bbox, url? }, …]` — URLs and/or bbox per crop |
| `items` / `items_upscaled` | `{ index, image\|url, bbox }` — sorted by `index` |
| `image` on an entry | Raw base64 (wrapped as `data:image/jpeg;base64,...` if needed) |

When a bbox is present for a crop, the final canvas places that item in the **same relative position** as on the original photo (scaled to the output canvas). If a URL has no bbox, the app falls back to a **grid** inside the source frame.

### Legacy JSON (optional fallback)

If multipart returns `images: { "<url>": ["…"] }` (old `image_urls` flow) and no multipart crops were parsed, the app may host the file via `POST /api/host-image` and retry resolution of that map (no bbox → grid layout).

### Environment

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|----------|---------|
| `FLASK_DETECT_URL` | Flask base (e.g. `http://127.0.0.1:5050`) or full URL `…/api/detect`. **In `next dev`, if unset, defaults to `http://127.0.0.1:5050/api/detect`.** Required for production (`next start`). |
| `NEXT_PUBLIC_APP_URL` | Used by `/api/host-image` for URLs Flask must fetch (legacy path). If Flask runs in Docker, use `http://host.docker.internal:3000` (Mac/Windows) or your LAN IP. |

### Production notes

- `/api/host-image` stores bytes **in memory** on the Node process—fine for `next dev` / single instance, not for serverless multi-instance.
- Remote crop URLs need **CORS** if `crossOrigin="anonymous"` is required for canvas export.

## Scripts

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
