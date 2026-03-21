import React, { useCallback, useMemo, useRef, useState } from "react";
import { Download, Plus, Trash2, Image as ImageIcon, SquareDashedMousePointer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const INITIAL_CANVAS = { width: 1200, height: 900, background: "#ffffff" };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SourceImage = {
  id: string;
  name: string;
  src: string;
  img: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
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
};

export default function HearingAidImageComposer() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [items, setItems] = useState<Item[]>([]);

  const activeSourceImage = useMemo(
    () => sourceImages.find((img) => img.id === activeSourceImageId) ?? null,
    [sourceImages, activeSourceImageId]
  );

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
        };

        setSourceImages((prev) => [...prev, entry]);
        setActiveSourceImageId((current) => current ?? id);
        if (index === 0 && !activeSourceImageId) {
          setCrop({
            x: 20,
            y: 20,
            width: Math.min(220, img.naturalWidth - 20),
            height: Math.min(160, img.naturalHeight - 20),
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
      y: clientY - rect.top,
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
        y: clamp(sy - dragOffset.y, 0, Math.max(0, activeSourceImage.naturalHeight - prev.height)),
      }));
      return;
    }

    if (isDrawingCrop) {
      setCrop((prev) => ({
        x: Math.min(prev.x, sx),
        y: Math.min(prev.y, sy),
        width: Math.abs(sx - prev.x),
        height: Math.abs(sy - prev.y),
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
    const aspect = crop.width / crop.height;
    const startWidth = 180;
    const startHeight = startWidth / aspect;

    const newItem: Item = {
      id,
      sourceImageId: activeSourceImage.id,
      name: `Item ${items.length + 1}`,
      crop: { ...crop },
      x: 40 + items.length * 20,
      y: 40 + items.length * 20,
      width: startWidth,
      height: startHeight,
      rotation: 0,
      zIndex: items.length + 1,
    };

    setItems((prev) => [...prev, newItem]);
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
              y: clamp(pos.y - dragOffset.y, 0, canvasSize.height - item.height),
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
    setItems((prev) => prev.filter((item) => item.id !== selectedItemId));
    setSelectedItemId(null);
  };

  const resetLayout = () => {
    setItems([]);
    setSelectedItemId(null);
  };

  const selectSourceImage = (id: string) => {
    const img = sourceImages.find((entry) => entry.id === id);
    if (!img) return;
    setActiveSourceImageId(id);
    setCrop({
      x: 20,
      y: 20,
      width: Math.min(220, img.naturalWidth - 20),
      height: Math.min(160, img.naturalHeight - 20),
    });
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
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hearing Aid eBay Image Composer</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Upload one or more product photos, crop items from any image, collect all cropped items into one pool,
            arrange them into a clean sales image, and download the final result.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr_1fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Upload source image(s)</Label>
                <Input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onUpload} />
              </div>

              <div className="space-y-2">
                <Label>Final canvas width</Label>
                <Input
                  type="number"
                  value={canvasSize.width}
                  onChange={(e) => setCanvasSize((p) => ({ ...p, width: Number(e.target.value) || 1200 }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Final canvas height</Label>
                <Input
                  type="number"
                  value={canvasSize.height}
                  onChange={(e) => setCanvasSize((p) => ({ ...p, height: Number(e.target.value) || 900 }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Background color</Label>
                <div className="flex gap-2">
                  <Input
                    value={canvasSize.background}
                    onChange={(e) => setCanvasSize((p) => ({ ...p, background: e.target.value }))}
                    placeholder="#ffffff"
                  />
                  <input
                    type="color"
                    value={canvasSize.background}
                    onChange={(e) => setCanvasSize((p) => ({ ...p, background: e.target.value }))}
                    className="h-10 w-14 rounded-md border"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={addCropAsItem} className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Add crop
                </Button>
                <Button variant="outline" onClick={resetLayout} className="rounded-xl">
                  <RefreshCw className="mr-2 h-4 w-4" /> Reset
                </Button>
                <Button variant="outline" onClick={downloadImage} className="rounded-xl">
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              </div>

              {selectedItem ? (
                <div className="space-y-4 rounded-2xl border p-4">
                  <div className="space-y-2">
                    <Label>Selected item name</Label>
                    <Input
                      value={selectedItem.name}
                      onChange={(e) => updateSelectedItem({ name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Width: {Math.round(selectedItem.width)} px</Label>
                    <Slider
                      value={[selectedItem.width]}
                      min={30}
                      max={500}
                      step={1}
                      onValueChange={([value]) => {
                        const aspect = selectedItem.crop.width / selectedItem.crop.height;
                        updateSelectedItem({ width: value, height: value / aspect });
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rotation: {selectedItem.rotation}°</Label>
                    <Slider
                      value={[selectedItem.rotation]}
                      min={-180}
                      max={180}
                      step={1}
                      onValueChange={([value]) => updateSelectedItem({ rotation: value })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={bringForward} className="rounded-xl">
                      Bring forward
                    </Button>
                    <Button variant="destructive" onClick={removeSelected} className="rounded-xl">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                  Select an item on the final canvas to edit its size and rotation.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <SquareDashedMousePointer className="h-5 w-5" /> Source image crop tool
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-600">
                Switch between uploaded images, drag on the image to create a crop, and add each crop to the shared pool.
              </div>

              {sourceImages.length > 0 && (
                <div className="rounded-2xl border p-3">
                  <div className="mb-2 text-sm font-medium">Source images</div>
                  <div className="space-y-2">
                    {sourceImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => selectSourceImage(img.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                          img.id === activeSourceImageId ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate font-medium">{img.name}</span>
                        <span className="ml-3 text-slate-500">{img.naturalWidth}×{img.naturalHeight}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="overflow-auto rounded-2xl border bg-white p-3">
                {activeSourceImage ? (
                  <canvas
                    ref={sourceCanvasRef}
                    onMouseDown={onSourceMouseDown}
                    onMouseMove={onSourceMouseMove}
                    onMouseUp={onSourceMouseUp}
                    onMouseLeave={onSourceMouseUp}
                    className="cursor-crosshair rounded-xl"
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed text-slate-500">
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-3 h-8 w-8" />
                      Upload one or more package images to begin.
                    </div>
                  </div>
                )}
              </div>

              {activeSourceImage && (
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>Source size: {activeSourceImage.naturalWidth} × {activeSourceImage.naturalHeight}</div>
                  <div>Crop: {Math.round(crop.width)} × {Math.round(crop.height)}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Final listing image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-600">
                Click and drag items to arrange them. Crops from all uploaded images appear together here.
              </div>
              <div className="overflow-auto rounded-2xl border bg-slate-100 p-3">
                <canvas
                  ref={finalCanvasRef}
                  onMouseDown={onFinalMouseDown}
                  onMouseMove={onFinalMouseMove}
                  onMouseUp={onFinalMouseUp}
                  onMouseLeave={onFinalMouseUp}
                  className="max-w-full rounded-xl bg-white shadow-sm"
                />
              </div>
              <div className="rounded-2xl border p-4">
                <div className="mb-2 text-sm font-medium">Cropped items pool</div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="text-sm text-slate-500">No cropped items added yet.</div>
                  ) : (
                    items
                      .slice()
                      .sort((a, b) => a.zIndex - b.zIndex)
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                            item.id === selectedItemId ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="text-slate-500">{Math.round(item.width)} px</span>
                        </button>
                      ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
