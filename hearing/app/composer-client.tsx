"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INITIAL_CANVAS = { width: 1200, height: 900, background: "#ffffff" };

function normalizeHexColor(hex: string): string {
  const t = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return t;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const t = normalizeHexColor(hex).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(t)) return null;
  return {
    r: parseInt(t.slice(0, 2), 16),
    g: parseInt(t.slice(2, 4), 16),
    b: parseInt(t.slice(4, 6), 16)
  };
}

/** WCAG relative luminance for contrast (0–1). */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const ss = s / 100;
  const ll = l / 100;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DetectResponse = {
  ok?: boolean;
  error?: string;
  count?: number;
  parent_size?: unknown;
  bboxes?: unknown[];
  crops?: unknown[];
  upscaled_urls?: unknown[];
  items?: unknown[];
  items_upscaled?: unknown[];
  /** Map source URL → crop objects (new) or legacy string URLs */
  images?: Record<string, unknown>;
  image_meta?: Record<string, unknown>;
  errors?: Record<string, string>;
};

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseBBox(raw: unknown): CropBox | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const x = asNum(o.x);
  const y = asNum(o.y);
  const w = asNum(o.width ?? o.w);
  const h = asNum(o.height ?? o.h);
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

/** Normalized bbox 0–1 relative to parent width/height */
function parseBBoxNorm(raw: unknown): CropBox | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const x = asNum(o.x);
  const y = asNum(o.y);
  const w = asNum(o.width);
  const h = asNum(o.height);
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

function parseParentSize(raw: unknown): { width: number; height: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const w = asNum(o.width);
  const h = asNum(o.height);
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

function bboxNormToPixels(norm: unknown, parentW: number, parentH: number): CropBox | null {
  const n = parseBBoxNorm(norm);
  if (!n) return null;
  return {
    x: n.x * parentW,
    y: n.y * parentH,
    width: n.width * parentW,
    height: n.height * parentH
  };
}

function getImageMetaForSource(
  imageMeta: Record<string, unknown> | undefined,
  sourceKey: string
): { parent_size?: { width: number; height: number } } | null {
  if (!imageMeta) return null;
  const direct = imageMeta[sourceKey];
  if (direct && typeof direct === "object") return direct as { parent_size?: { width: number; height: number } };
  const hit = Object.keys(imageMeta).find(
    (k) => k === sourceKey || decodeURIComponent(k) === decodeURIComponent(sourceKey)
  );
  if (hit && imageMeta[hit] && typeof imageMeta[hit] === "object") {
    return imageMeta[hit] as { parent_size?: { width: number; height: number } };
  }
  const keys = Object.keys(imageMeta);
  if (keys.length === 1 && imageMeta[keys[0]!] && typeof imageMeta[keys[0]!] === "object") {
    return imageMeta[keys[0]!] as { parent_size?: { width: number; height: number } };
  }
  return null;
}

/**
 * Flask JSON shape: images[sourceUrl] = [{ url, bbox?, bbox_norm?, ... }, ...] or legacy string[]
 */
function parseImagesRecord(
  images: unknown,
  imageMeta: Record<string, unknown> | undefined
): { url: string; bbox?: CropBox }[] {
  if (!images || typeof images !== "object" || Array.isArray(images)) return [];
  const out: { url: string; bbox?: CropBox }[] = [];
  for (const [sourceKey, list] of Object.entries(images as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const meta = getImageMetaForSource(imageMeta, sourceKey);
    const parentFromMeta = meta?.parent_size ? parseParentSize(meta.parent_size) : null;
    const pw = parentFromMeta?.width;
    const ph = parentFromMeta?.height;

    for (const entry of list) {
      if (typeof entry === "string" && entry) {
        out.push({ url: entry });
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : null;
      if (!url) continue;

      let bbox = parseBBox(o.bbox);
      if (!bbox && o.bbox_norm && pw && ph) {
        bbox = bboxNormToPixels(o.bbox_norm, pw, ph);
      }
      out.push(bbox ? { url, bbox } : { url });
    }
  }
  return out;
}

function extractUrlFromDetectEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const o = entry as Record<string, unknown>;
  if (typeof o.url === "string" && o.url.length > 0) return o.url;
  if (typeof o.image === "string" && o.image.length > 0) {
    const im = o.image;
    if (im.startsWith("data:") || im.startsWith("http://") || im.startsWith("https://")) return im;
    return `data:image/jpeg;base64,${im}`;
  }
  return null;
}

/**
 * Parse Flask multipart / JSON detect payload: ordered urls; bbox = source-space rect when present.
 */
function parseDetectCrops(data: Record<string, unknown>): { url: string; bbox?: CropBox }[] {
  const imageMeta = data.image_meta as Record<string, unknown> | undefined;
  if (data.images) {
    const fromImages = parseImagesRecord(data.images, imageMeta);
    if (fromImages.length) return fromImages;
  }

  const out: { url: string; bbox?: CropBox }[] = [];
  const parentSize = parseParentSize(data.parent_size);

  const bboxesList = Array.isArray(data.bboxes)
    ? (data.bboxes.map(parseBBox).filter(Boolean) as CropBox[])
    : [];

  const upscaled = data.upscaled_urls;
  if (Array.isArray(upscaled) && upscaled.length > 0) {
    const cropsArr = Array.isArray(data.crops) ? (data.crops as unknown[]) : [];
    upscaled.forEach((u, i) => {
      if (typeof u !== "string" || !u) return;
      let bbox: CropBox | undefined = bboxesList[i];
      const cropRow = cropsArr[i];
      if (!bbox && cropRow && typeof cropRow === "object") {
        const cr = cropRow as Record<string, unknown>;
        bbox = parseBBox(cr.bbox) ?? undefined;
        if (!bbox && parentSize && cr.bbox_norm) {
          bbox = bboxNormToPixels(cr.bbox_norm, parentSize.width, parentSize.height) ?? undefined;
        }
      }
      out.push(bbox ? { url: u, bbox } : { url: u });
    });
    if (out.length > 0) return out;
  }

  const tryArray = (arr: unknown) => {
    if (!Array.isArray(arr) || arr.length === 0) return;
    type Row = { url: string; bbox?: CropBox; idx: number };
    const rows: Row[] = [];
    arr.forEach((entry, i) => {
      const url = extractUrlFromDetectEntry(entry);
      if (!url) return;
      const eo = entry as Record<string, unknown>;
      let bbox: CropBox | null = parseBBox(eo?.bbox);
      if (!bbox && parentSize && eo?.bbox_norm) {
        bbox = bboxNormToPixels(eo.bbox_norm, parentSize.width, parentSize.height);
      }
      if (!bbox && bboxesList[i]) bbox = bboxesList[i]!;
      const idx = asNum(eo?.index, i);
      rows.push({ url, bbox: bbox ?? undefined, idx });
    });
    rows.sort((a, b) => a.idx - b.idx);
    rows.forEach((r) => out.push(r.bbox ? { url: r.url, bbox: r.bbox } : { url: r.url }));
  };

  tryArray(data.crops);
  if (out.length > 0) return out;
  tryArray(data.items_upscaled);
  if (out.length > 0) return out;
  tryArray(data.items);

  return out;
}

/** Legacy: string[] per URL, or [{ url }] objects */
function resolveCropUrls(images: Record<string, unknown>, requestedUrl: string): string[] {
  const urlsFromList = (list: unknown): string[] => {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const entry of list) {
      if (typeof entry === "string" && entry) out.push(entry);
      else if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).url === "string") {
        out.push((entry as Record<string, unknown>).url as string);
      }
    }
    return out;
  };

  const direct = urlsFromList(images[requestedUrl]);
  if (direct.length) return direct;
  const keys = Object.keys(images);
  const hit = keys.find(
    (k) => decodeURIComponent(k) === decodeURIComponent(requestedUrl) || k === requestedUrl
  );
  if (hit) {
    const fromHit = urlsFromList(images[hit]);
    if (fromHit.length) return fromHit;
  }
  if (keys.length === 1) {
    const one = urlsFromList(images[keys[0]!]);
    if (one.length) return one;
  }
  return [];
}

function resolveErrorForUrl(errors: Record<string, string> | undefined, requestedUrl: string): string | undefined {
  if (!errors) return undefined;
  if (errors[requestedUrl]) return errors[requestedUrl];
  const keys = Object.keys(errors);
  const hit = keys.find(
    (k) => decodeURIComponent(k) === decodeURIComponent(requestedUrl) || k === requestedUrl
  );
  if (hit) return errors[hit];
  if (keys.length === 1) return errors[keys[0]!];
  return undefined;
}

function loadRemoteImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 80)}…`));
    img.src = url;
  });
}

type SourceImage = {
  id: string;
  name: string;
  src: string;
  img: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  /** Public HTTPS URL Flask can fetch; set after /api/host-image or if already remote */
  publicUrl: string | null;
  /** Original file for hosting via Next when publicUrl is missing */
  file: File | null;
  /** AI crop outputs: hidden from "Source images" list; only shown in cropped items pool */
  isDerivedFromAi: boolean;
  /** Original upload id for AI crops; used to group items for proportional layout */
  derivedFromSourceId: string | null;
};

type Item = {
  id: string;
  sourceImageId: string;
  name: string;
  crop: CropBox;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  /** AI detect: bbox in root source pixel space for proportional layout on final canvas */
  parentSpaceBbox?: CropBox;
};

function getRootSourceId(item: Item, sourceImages: SourceImage[]): string | null {
  const src = sourceImages.find((s) => s.id === item.sourceImageId);
  if (!src) return null;
  if (src.isDerivedFromAi && src.derivedFromSourceId) return src.derivedFromSourceId;
  if (!src.isDerivedFromAi) return src.id;
  return null;
}

/**
 * Places items on the final canvas in the same relative layout as on the original source:
 * - Manual crops: position/size from crop rect × scale (letterboxed to canvas).
 * - AI-derived crops with parentSpaceBbox: same as manual (bbox × scale).
 * - AI-derived without bbox: grid inside the same scaled parent frame (bottom band if manuals exist).
 */
function relayoutComposedItems(
  items: Item[],
  sourceImages: SourceImage[],
  canvasSize: { width: number; height: number }
): Item[] {
  if (items.length === 0) return items;

  const rootsOrdered: string[] = [];
  const seenRoot = new Set<string>();
  for (const it of items) {
    const r = getRootSourceId(it, sourceImages);
    if (r && !seenRoot.has(r)) {
      seenRoot.add(r);
      rootsOrdered.push(r);
    }
  }
  if (rootsOrdered.length === 0) return items;

  const patches = new Map<string, Partial<Item>>();
  const slotH = canvasSize.height / rootsOrdered.length;

  for (let ri = 0; ri < rootsOrdered.length; ri++) {
    const rootId = rootsOrdered[ri]!;
    const orig = sourceImages.find((s) => s.id === rootId && !s.isDerivedFromAi);
    if (!orig) continue;

    const groupItems = items.filter((it) => getRootSourceId(it, sourceImages) === rootId);
    if (groupItems.length === 0) continue;

    const rect =
      rootsOrdered.length === 1
        ? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
        : { x: 0, y: ri * slotH, width: canvasSize.width, height: slotH };

    const refW = orig.naturalWidth;
    const refH = orig.naturalHeight;
    const scale = Math.min(rect.width / refW, rect.height / refH);
    const contentW = refW * scale;
    const contentH = refH * scale;
    const ox = rect.x + (rect.width - contentW) / 2;
    const oy = rect.y + (rect.height - contentH) / 2;

    const manual: Item[] = [];
    const derived: Item[] = [];
    for (const it of groupItems) {
      const src = sourceImages.find((s) => s.id === it.sourceImageId);
      if (!src) continue;
      if (src.isDerivedFromAi) derived.push(it);
      else manual.push(it);
    }

    for (const it of manual) {
      const c = it.crop;
      patches.set(it.id, {
        x: ox + c.x * scale,
        y: oy + c.y * scale,
        width: Math.max(8, c.width * scale),
        height: Math.max(8, c.height * scale)
      });
    }

    for (const it of derived) {
      if (it.parentSpaceBbox) {
        const b = it.parentSpaceBbox;
        patches.set(it.id, {
          x: ox + b.x * scale,
          y: oy + b.y * scale,
          width: Math.max(8, b.width * scale),
          height: Math.max(8, b.height * scale)
        });
      }
    }

    const derivedForGrid = derived.filter((it) => !it.parentSpaceBbox);

    let gx = ox;
    let gy = oy;
    let gw = contentW;
    let gh = contentH;
    if (manual.length > 0 && derivedForGrid.length > 0) {
      const split = 0.46;
      gy = oy + contentH * (1 - split);
      gh = contentH * split;
    }

    const sortedDerived = [...derivedForGrid].sort((a, b) => a.zIndex - b.zIndex);
    const n = sortedDerived.length;
    if (n > 0) {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cellW = gw / cols;
      const cellH = gh / rows;
      const pad = 0.08;
      sortedDerived.forEach((it, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = gx + col * cellW;
        const cy = gy + row * cellH;
        const cw = cellW * (1 - pad);
        const ch = cellH * (1 - pad);
        const aspect = it.crop.width / it.crop.height;
        let w = cw;
        let h = w / aspect;
        if (h > ch) {
          h = ch;
          w = h * aspect;
        }
        patches.set(it.id, {
          x: cx + (cellW - w) / 2,
          y: cy + (cellH - h) / 2,
          width: Math.max(8, w),
          height: Math.max(8, h)
        });
      });
    }
  }

  return items.map((it) => {
    const p = patches.get(it.id);
    return p ? { ...it, ...p } : it;
  });
}

function ItemThumb({
  item,
  source,
  listingBackground
}: {
  item: Item;
  source: SourceImage;
  listingBackground: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rgbOk = hexToRgb(listingBackground);
  const bg = rgbOk ? normalizeHexColor(listingBackground) : "#ffffff";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = 96;
    const h = 96;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    try {
      ctx.drawImage(
        source.img,
        item.crop.x,
        item.crop.y,
        item.crop.width,
        item.crop.height,
        0,
        0,
        w,
        h
      );
    } catch {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, 0, w, h);
    }
  }, [item, source, bg]);

  return (
    <canvas
      ref={ref}
      style={{
        width: 96,
        height: 96,
        borderRadius: 10,
        border: "1px solid #cbd5e1",
        display: "block",
        background: bg
      }}
    />
  );
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16
};

export default function ComposerClient() {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const finalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);
  const [activeSourceImageId, setActiveSourceImageId] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [crop, setCrop] = useState<CropBox>({ x: 40, y: 40, width: 180, height: 140 });
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [dragMode, setDragMode] = useState<null | "moveCrop" | "moveItem">(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState(INITIAL_CANVAS);
  const [bgHsl, setBgHsl] = useState(() => hexToHsl(INITIAL_CANVAS.background) ?? { h: 0, s: 0, l: 100 });
  const [items, setItems] = useState<Item[]>([]);
  const [aiDetectingForSourceId, setAiDetectingForSourceId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const p = hexToHsl(normalizeHexColor(canvasSize.background));
    if (!p) return;
    setBgHsl((prev) => (prev.h === p.h && prev.s === p.s && prev.l === p.l ? prev : p));
  }, [canvasSize.background]);

  const bgHslRef = useRef(bgHsl);
  bgHslRef.current = bgHsl;

  const applyListingBackground = useCallback(() => {
    const h = bgHslRef.current;
    setCanvasSize((c) => ({ ...c, background: hslToHex(h.h, h.s, h.l) }));
  }, []);

  const previewListingHex = useMemo(
    () => normalizeHexColor(hslToHex(bgHsl.h, bgHsl.s, bgHsl.l)),
    [bgHsl.h, bgHsl.s, bgHsl.l]
  );
  const appliedListingHex = useMemo(() => normalizeHexColor(canvasSize.background), [canvasSize.background]);
  const listingBgNeedsApply = previewListingHex !== appliedListingHex;

  /** Text on pool tiles uses the applied listing bg (same as thumbnails). */
  const poolTileText = useMemo(() => {
    const L = relativeLuminance(appliedListingHex);
    if (L > 0.45) {
      return { name: "#0f172a", meta: "#64748b" as const };
    }
    return { name: "#f8fafc", meta: "#cbd5e1" as const };
  }, [appliedListingHex]);

  const sourceImagesRef = useRef<SourceImage[]>([]);
  useEffect(() => {
    sourceImagesRef.current = sourceImages;
  }, [sourceImages]);

  const canvasSizeRef = useRef(canvasSize);
  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  /** Re-run proportional layout when output dimensions change */
  useEffect(() => {
    setItems((prev) =>
      prev.length ? relayoutComposedItems(prev, sourceImagesRef.current, canvasSize) : prev
    );
  }, [canvasSize.width, canvasSize.height]);

  const listableSources = useMemo(
    () => sourceImages.filter((s) => !s.isDerivedFromAi),
    [sourceImages]
  );

  const activeSourceImage = useMemo(() => {
    const img = sourceImages.find((i) => i.id === activeSourceImageId) ?? null;
    if (!img || img.isDerivedFromAi) return null;
    return img;
  }, [sourceImages, activeSourceImageId]);

  /** If active id pointed at a derived source (legacy), switch to first upload */
  useEffect(() => {
    const active = sourceImages.find((s) => s.id === activeSourceImageId);
    if (active?.isDerivedFromAi) {
      const fallback = sourceImages.find((s) => !s.isDerivedFromAi)?.id ?? null;
      setActiveSourceImageId(fallback);
    }
  }, [sourceImages, activeSourceImageId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const redrawSource = useCallback(() => {
    const canvas = sourceCanvasRef.current;
    const image = activeSourceImage?.img ?? null;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxPreviewWidth = 680;
    const scale = Math.min(1, maxPreviewWidth / image.naturalWidth);
    setDisplayScale(scale);

    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.strokeRect(crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale);
    ctx.restore();
  }, [activeSourceImage, crop]);

  const redrawFinal = useCallback(() => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = canvasSize.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);
    ordered.forEach((item) => {
      const src = sourceImages.find((img) => img.id === item.sourceImageId);
      if (!src) return;

      ctx.save();
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.fillStyle = canvasSize.background;
      ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      ctx.drawImage(
        src.img,
        item.crop.x,
        item.crop.y,
        item.crop.width,
        item.crop.height,
        -item.width / 2,
        -item.height / 2,
        item.width,
        item.height
      );

      if (item.id === selectedItemId) {
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 3;
        ctx.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height);
      }
      ctx.restore();
    });
  }, [canvasSize, items, selectedItemId, sourceImages]);

  React.useEffect(() => {
    redrawSource();
  }, [redrawSource]);

  React.useEffect(() => {
    redrawFinal();
  }, [redrawFinal]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const id = crypto.randomUUID();
        const entry: SourceImage = {
          id,
          name: file.name || `Source ${index + 1}`,
          src: url,
          img,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          publicUrl: null,
          file,
          isDerivedFromAi: false,
          derivedFromSourceId: null
        };

        setSourceImages((prev) => [...prev, entry]);
        setActiveSourceImageId((current) => current ?? id);
        if (index === 0 && !activeSourceImageId) {
          setCrop({
            x: 20,
            y: 20,
            width: Math.min(220, img.naturalWidth - 20),
            height: Math.min(160, img.naturalHeight - 20)
          });
        }
      };
      img.src = url;
    });

    e.target.value = "";
  };

  const getCanvasCoords = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const onSourceMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !activeSourceImage) return;

    const pos = getCanvasCoords(e.clientX, e.clientY, canvas);
    const sx = pos.x / displayScale;
    const sy = pos.y / displayScale;

    const inside =
      sx >= crop.x &&
      sx <= crop.x + crop.width &&
      sy >= crop.y &&
      sy <= crop.y + crop.height;

    if (inside) {
      setDragMode("moveCrop");
      setDragOffset({ x: sx - crop.x, y: sy - crop.y });
    } else {
      setIsDrawingCrop(true);
      setCrop({ x: sx, y: sy, width: 1, height: 1 });
    }
  };

  const onSourceMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !activeSourceImage) return;
    const pos = getCanvasCoords(e.clientX, e.clientY, canvas);
    const sx = pos.x / displayScale;
    const sy = pos.y / displayScale;

    if (dragMode === "moveCrop") {
      setCrop((prev) => ({
        ...prev,
        x: clamp(sx - dragOffset.x, 0, Math.max(0, activeSourceImage.naturalWidth - prev.width)),
        y: clamp(sy - dragOffset.y, 0, Math.max(0, activeSourceImage.naturalHeight - prev.height))
      }));
      return;
    }

    if (isDrawingCrop) {
      setCrop((prev) => ({
        x: Math.min(prev.x, sx),
        y: Math.min(prev.y, sy),
        width: Math.abs(sx - prev.x),
        height: Math.abs(sy - prev.y)
      }));
    }
  };

  const onSourceMouseUp = () => {
    setIsDrawingCrop(false);
    setDragMode(null);
  };

  const addCropAsItem = () => {
    if (!activeSourceImage || crop.width < 8 || crop.height < 8) return;
    const id = crypto.randomUUID();

    setItems((prev) => {
      const maxZ = prev.reduce((m, i) => Math.max(m, i.zIndex), 0);
      const newItem: Item = {
        id,
        sourceImageId: activeSourceImage.id,
        name: `Item ${prev.length + 1}`,
        crop: { ...crop },
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        zIndex: maxZ + 1
      };
      const next = [...prev, newItem];
      return relayoutComposedItems(next, sourceImagesRef.current, canvasSizeRef.current);
    });
    setSelectedItemId(id);
  };

  const pointInItem = (x: number, y: number, item: Item) => {
    return x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height;
  };

  const onFinalMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    const pos = getCanvasCoords(e.clientX, e.clientY, canvas);

    const hit = [...items]
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((item) => pointInItem(pos.x, pos.y, item));

    if (hit) {
      setSelectedItemId(hit.id);
      setDragMode("moveItem");
      setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
    } else {
      setSelectedItemId(null);
    }
  };

  const onFinalMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMode !== "moveItem" || !selectedItemId) return;
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    const pos = getCanvasCoords(e.clientX, e.clientY, canvas);

    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedItemId
          ? {
              ...item,
              x: clamp(pos.x - dragOffset.x, 0, canvasSize.width - item.width),
              y: clamp(pos.y - dragOffset.y, 0, canvasSize.height - item.height)
            }
          : item
      )
    );
  };

  const onFinalMouseUp = () => setDragMode(null);

  const updateSelectedItem = (patch: Partial<Item>) => {
    if (!selectedItemId) return;
    setItems((prev) => prev.map((item) => (item.id === selectedItemId ? { ...item, ...patch } : item)));
  };

  const bringForward = () => {
    if (!selectedItem) return;
    const maxZ = Math.max(...items.map((i) => i.zIndex), 0);
    updateSelectedItem({ zIndex: maxZ + 1 });
  };

  const removeSelected = () => {
    if (!selectedItemId) return;
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== selectedItemId);
      return next.length
        ? relayoutComposedItems(next, sourceImagesRef.current, canvasSizeRef.current)
        : next;
    });
    setSelectedItemId(null);
  };

  const resetLayout = () => {
    setItems([]);
    setSelectedItemId(null);
    setSourceImages((prev) => prev.filter((s) => !s.isDerivedFromAi));
  };

  const selectSourceImage = (id: string) => {
    const img = sourceImages.find((entry) => entry.id === id);
    if (!img || img.isDerivedFromAi) return;
    setActiveSourceImageId(id);
    setCrop({
      x: 20,
      y: 20,
      width: Math.min(220, img.naturalWidth - 20),
      height: Math.min(160, img.naturalHeight - 20)
    });
  };

  const onAiCropForSource = async (sourceId: string) => {
    setAiError(null);
    setAiDetectingForSourceId(sourceId);
    try {
      const source = sourceImagesRef.current.find((s) => s.id === sourceId);
      if (!source) throw new Error("Source image not found.");
      if (!source.file) {
        throw new Error("Missing original file. Re-upload this image to run AI crop.");
      }

      const fd = new FormData();
      const name = source.file.name || "source.jpg";
      fd.append("file", source.file, name);
      fd.append("image", source.file, name);
      fd.append("upscale", "true");
      fd.append("bytescale", "true");

      const detectRes = await fetch("/api/detect-proxy", {
        method: "POST",
        body: fd
      });

      const data = (await detectRes.json()) as DetectResponse;
      const rec = data as Record<string, unknown>;

      if (!detectRes.ok) {
        throw new Error(data.error || `Detect proxy error (${detectRes.status})`);
      }

      if (data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : "Detect returned ok: false");
      }

      let parsed = parseDetectCrops(rec);

      if (parsed.length === 0 && data.images) {
        let publicUrl = source.publicUrl;
        if (!publicUrl) {
          const upFd = new FormData();
          upFd.append("file", source.file);
          const up = await fetch("/api/host-image", { method: "POST", body: upFd });
          const upJson = (await up.json()) as { url?: string; error?: string };
          if (!up.ok) throw new Error(upJson.error || `Host failed (${up.status})`);
          publicUrl = upJson.url!;
          setSourceImages((prev) => prev.map((s) => (s.id === sourceId ? { ...s, publicUrl } : s)));
        }
        const perUrlError = resolveErrorForUrl(data.errors, publicUrl);
        if (perUrlError) setAiError(perUrlError);
        const urls = resolveCropUrls(data.images, publicUrl).filter(Boolean);
        parsed = urls.map((url) => ({ url }));
      }

      if (parsed.length === 0) {
        setAiError("No crops returned (no URLs or images in response).");
        return;
      }

      const sourceSnapshot = sourceImagesRef.current.find((s) => s.id === sourceId) ?? source;

      const newSources: SourceImage[] = await Promise.all(
        parsed.map(async (row, i) => {
          const img = await loadRemoteImage(row.url);
          const id = crypto.randomUUID();
          return {
            id,
            name: `${sourceSnapshot.name} · auto ${i + 1}`,
            src: row.url,
            img,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            publicUrl: row.url.startsWith("data:") ? null : row.url,
            file: null,
            isDerivedFromAi: true,
            derivedFromSourceId: sourceSnapshot.id
          };
        })
      );

      const mergedSources = [...sourceImagesRef.current, ...newSources];

      setSourceImages((prev) => [...prev, ...newSources]);

      setItems((prev) => {
        const maxZ = prev.reduce((m, i) => Math.max(m, i.zIndex), 0);
        const additions: Item[] = newSources.map((src, i) => {
          const row = parsed[i]!;
          return {
            id: crypto.randomUUID(),
            sourceImageId: src.id,
            name: `Auto ${prev.length + i + 1}`,
            crop: {
              x: 0,
              y: 0,
              width: src.naturalWidth,
              height: src.naturalHeight
            },
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            rotation: 0,
            zIndex: maxZ + i + 1,
            parentSpaceBbox: row.bbox
          };
        });
        return relayoutComposedItems([...prev, ...additions], mergedSources, canvasSizeRef.current);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI crop failed";
      setAiError(message);
    } finally {
      setAiDetectingForSourceId(null);
    }
  };

  const downloadImage = () => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "hearing-aid-listing.png";
    link.click();
  };

  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Hearing Aid eBay Image Composer</h1>
        <p style={{ color: "#475569", marginBottom: 24 }}>
          Upload product photos, crop items from any image, arrange them into one final listing image, then download.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "340px 1fr" }}>
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Controls</h3>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="upload" style={{ display: "block", marginBottom: 6 }}>
                Upload source image(s)
              </label>
              <input id="upload" type="file" accept="image/*" multiple onChange={onUpload} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label htmlFor="width" style={{ display: "block", marginBottom: 6 }}>
                Final canvas width
              </label>
              <input
                id="width"
                type="number"
                value={canvasSize.width}
                onChange={(e) => setCanvasSize((p) => ({ ...p, width: Number(e.target.value) || 1200 }))}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label htmlFor="height" style={{ display: "block", marginBottom: 6 }}>
                Final canvas height
              </label>
              <input
                id="height"
                type="number"
                value={canvasSize.height}
                onChange={(e) => setCanvasSize((p) => ({ ...p, height: Number(e.target.value) || 900 }))}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                Background (exact value)
              </div>
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 0, marginBottom: 8 }}>
                Use <strong>HSL + Apply</strong> beside the final listing image, or set hex here (applies immediately).
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  id="bg"
                  aria-label="Background hex"
                  value={canvasSize.background}
                  onChange={(e) => setCanvasSize((p) => ({ ...p, background: e.target.value }))}
                  placeholder="#hex"
                  style={{ flex: "1 1 120px", minWidth: 100 }}
                />
                <input
                  type="color"
                  aria-label="Background color picker"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(canvasSize.background.trim())
                      ? canvasSize.background.trim()
                      : "#ffffff"
                  }
                  onChange={(e) => setCanvasSize((p) => ({ ...p, background: e.target.value }))}
                  style={{ width: 44, height: 36, padding: 2, cursor: "pointer" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button type="button" onClick={addCropAsItem}>
                Add crop
              </button>
              <button type="button" onClick={resetLayout}>
                Reset
              </button>
              <button type="button" onClick={downloadImage}>
                Download
              </button>
            </div>

            {selectedItem ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="itemName" style={{ display: "block", marginBottom: 6 }}>
                    Selected item name
                  </label>
                  <input
                    id="itemName"
                    value={selectedItem.name}
                    onChange={(e) => updateSelectedItem({ name: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="itemWidth" style={{ display: "block", marginBottom: 6 }}>
                    Width: {Math.round(selectedItem.width)} px
                  </label>
                  <input
                    id="itemWidth"
                    type="range"
                    value={selectedItem.width}
                    min={30}
                    max={500}
                    step={1}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      const aspect = selectedItem.crop.width / selectedItem.crop.height;
                      updateSelectedItem({ width: value, height: value / aspect });
                    }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="rotation" style={{ display: "block", marginBottom: 6 }}>
                    Rotation: {selectedItem.rotation}°
                  </label>
                  <input
                    id="rotation"
                    type="range"
                    value={selectedItem.rotation}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(e) => updateSelectedItem({ rotation: Number(e.target.value) })}
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={bringForward}>
                    Bring forward
                  </button>
                  <button type="button" onClick={removeSelected}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: "#64748b", margin: 0 }}>Select an item on the final canvas to edit size and rotation.</p>
            )}
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Source image crop tool</h3>
            <p style={{ color: "#475569" }}>
              Switch between uploaded images, drag to create crop, then add to the shared pool.
            </p>

            {listableSources.length > 0 ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Source images</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {listableSources.map((img) => (
                    <div
                      key={img.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap"
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectSourceImage(img.id)}
                        style={{
                          flex: "1 1 160px",
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: `1px solid ${img.id === activeSourceImageId ? "#3b82f6" : "#cbd5e1"}`,
                          background: img.id === activeSourceImageId ? "#eff6ff" : "#ffffff"
                        }}
                      >
                        {img.name} ({img.naturalWidth}x{img.naturalHeight})
                      </button>
                      <button
                        type="button"
                        disabled={aiDetectingForSourceId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onAiCropForSource(img.id);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: "1px solid #0f172a",
                          background: aiDetectingForSourceId === img.id ? "#e2e8f0" : "#0f172a",
                          color: aiDetectingForSourceId === img.id ? "#64748b" : "#ffffff",
                          cursor: aiDetectingForSourceId !== null ? "not-allowed" : "pointer",
                          minWidth: 72
                        }}
                      >
                        {aiDetectingForSourceId === img.id ? "…" : "Crop"}
                      </button>
                    </div>
                  ))}
                </div>
                {aiError ? (
                  <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 10, marginBottom: 0 }}>{aiError}</p>
                ) : null}
              </div>
            ) : null}

            <div style={{ overflow: "auto", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12 }}>
              {activeSourceImage ? (
                <canvas
                  ref={sourceCanvasRef}
                  onMouseDown={onSourceMouseDown}
                  onMouseMove={onSourceMouseMove}
                  onMouseUp={onSourceMouseUp}
                  onMouseLeave={onSourceMouseUp}
                  style={{ borderRadius: 10, display: "block", cursor: "crosshair" }}
                />
              ) : (
                <div
                  style={{
                    minHeight: 420,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed #94a3b8",
                    borderRadius: 10,
                    color: "#64748b"
                  }}
                >
                  Upload one or more package images to begin.
                </div>
              )}
            </div>

            {activeSourceImage ? (
              <p style={{ color: "#475569", marginBottom: 0 }}>
                Source: {activeSourceImage.naturalWidth}x{activeSourceImage.naturalHeight} | Crop:{" "}
                {Math.round(crop.width)}x{Math.round(crop.height)}
              </p>
            ) : null}
          </section>
        </div>

        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: "1.125rem" }}>Final listing image</h3>
          <p style={{ color: "#475569", marginTop: 0, marginBottom: 12 }}>
            Click and drag items to arrange them. Use HSL preview + <strong>Apply</strong> on the right (or hex in
            Controls) for the listing background.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
              gap: 20,
              alignItems: "start"
            }}
          >
            <div
              style={{
                overflow: "auto",
                minWidth: 0,
                background: appliedListingHex,
                borderRadius: 12,
                padding: 10,
                border: "1px solid #e2e8f0",
                boxSizing: "border-box"
              }}
            >
              <canvas
                ref={finalCanvasRef}
                onMouseDown={onFinalMouseDown}
                onMouseMove={onFinalMouseMove}
                onMouseUp={onFinalMouseUp}
                onMouseLeave={onFinalMouseUp}
                style={{
                  maxWidth: "100%",
                  background: appliedListingHex,
                  borderRadius: 10,
                  display: "block"
                }}
              />
            </div>
            <aside
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 12,
                background: "#f8fafc",
                position: "sticky",
                top: 16
              }}
              aria-label="Listing background color"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                  flexWrap: "wrap"
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>Listing background color</div>
                <button
                  type="button"
                  onClick={applyListingBackground}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: listingBgNeedsApply ? "#0f172a" : "#e2e8f0",
                    color: listingBgNeedsApply ? "#ffffff" : "#64748b",
                    cursor: "pointer"
                  }}
                  title="Use the HSL preview color on the listing canvas, frame, and all crop thumbnails"
                >
                  Apply
                </button>
              </div>
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                Adjust HSL for a <strong>preview</strong>, then click <strong>Apply</strong> to use it on the final
                canvas, the frame around it, and the full background behind every crop thumbnail. Hex / color in
                Controls applies immediately.
              </p>
              <div
                style={{
                  height: 14,
                  borderRadius: 7,
                  marginBottom: 2,
                  border: "1px solid #cbd5e1",
                  background:
                    "linear-gradient(90deg, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%)"
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label htmlFor="bg-hue" style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                  Hue
                </label>
                <span style={{ fontSize: 12, color: "#64748b" }}>{bgHsl.h}°</span>
              </div>
              <input
                id="bg-hue"
                type="range"
                min={0}
                max={360}
                value={bgHsl.h}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  const prev = bgHslRef.current;
                  const next = { ...prev, h };
                  bgHslRef.current = next;
                  setBgHsl(next);
                }}
                style={{ width: "100%", marginBottom: 14, cursor: "pointer", height: 6 }}
              />
              <div
                style={{
                  height: 14,
                  borderRadius: 7,
                  marginBottom: 2,
                  border: "1px solid #cbd5e1",
                  background: `linear-gradient(90deg, hsl(${bgHsl.h},0%,${bgHsl.l}%), hsl(${bgHsl.h},100%,${bgHsl.l}%))`
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label htmlFor="bg-sat" style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                  Saturation
                </label>
                <span style={{ fontSize: 12, color: "#64748b" }}>{bgHsl.s}%</span>
              </div>
              <input
                id="bg-sat"
                type="range"
                min={0}
                max={100}
                value={bgHsl.s}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  const prev = bgHslRef.current;
                  const next = { ...prev, s };
                  bgHslRef.current = next;
                  setBgHsl(next);
                }}
                style={{ width: "100%", marginBottom: 14, cursor: "pointer", height: 6 }}
              />
              <div
                style={{
                  height: 14,
                  borderRadius: 7,
                  marginBottom: 2,
                  border: "1px solid #cbd5e1",
                  background: `linear-gradient(90deg, hsl(${bgHsl.h},${bgHsl.s}%,0%), hsl(${bgHsl.h},${bgHsl.s}%,50%), hsl(${bgHsl.h},${bgHsl.s}%,100%))`
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label htmlFor="bg-light" style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                  Lightness
                </label>
                <span style={{ fontSize: 12, color: "#64748b" }}>{bgHsl.l}%</span>
              </div>
              <input
                id="bg-light"
                type="range"
                min={0}
                max={100}
                value={bgHsl.l}
                onChange={(e) => {
                  const l = Number(e.target.value);
                  const prev = bgHslRef.current;
                  const next = { ...prev, l };
                  bgHslRef.current = next;
                  setBgHsl(next);
                }}
                style={{ width: "100%", marginBottom: 8, cursor: "pointer", height: 6 }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    title="HSL preview (click Apply to use)"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: previewListingHex,
                      flexShrink: 0
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Preview (HSL)</div>
                    <code style={{ fontSize: 13, color: "#0f172a", wordBreak: "break-all" }}>{previewListingHex}</code>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    title="Applied to canvas, frame, and crop thumbnails"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: appliedListingHex,
                      flexShrink: 0
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Applied</div>
                    <code style={{ fontSize: 13, color: "#0f172a", wordBreak: "break-all" }}>{appliedListingHex}</code>
                  </div>
                </div>
                {listingBgNeedsApply ? (
                  <div style={{ fontSize: 11, color: "#b45309", margin: 0 }}>
                    Preview differs from applied — click <strong>Apply</strong> to update the canvas and crops.
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>

        <section
          style={{
            ...cardStyle,
            marginTop: 16,
            minHeight: 280
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Cropped items pool</div>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 0, marginBottom: 16 }}>
            Items from manual &quot;Add crop&quot; or AI &quot;Crop&quot; appear here. Click a tile to select it on the
            canvas above.
          </p>
          {items.length === 0 ? (
            <div style={{ color: "#64748b" }}>No cropped items yet. Use Add crop or Crop on a source image.</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
                alignItems: "start"
              }}
            >
              {items
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((item) => {
                  const src = sourceImages.find((s) => s.id === item.sourceImageId);
                  if (!src) return null;
                  const tileBorder =
                    item.id === selectedItemId
                      ? "#3b82f6"
                      : relativeLuminance(appliedListingHex) > 0.45
                        ? "rgba(15, 23, 42, 0.12)"
                        : "rgba(248, 250, 252, 0.28)";
                  const tileBg =
                    item.id === selectedItemId
                      ? `color-mix(in srgb, #3b82f6 14%, ${appliedListingHex})`
                      : appliedListingHex;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        borderRadius: 12,
                        border: `2px solid ${tileBorder}`,
                        background: tileBg,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        alignItems: "stretch"
                      }}
                    >
                      <ItemThumb
                        key={`thumb-${item.id}-${appliedListingHex}`}
                        item={item}
                        source={src}
                        listingBackground={appliedListingHex}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: poolTileText.name }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: 12, color: poolTileText.meta }}>{Math.round(item.width)} px wide</span>
                    </button>
                  );
                })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
