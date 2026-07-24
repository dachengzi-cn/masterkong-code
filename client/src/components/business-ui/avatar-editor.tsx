"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const PREVIEW_SIZE = 256
const OUTPUT_SIZE = 256
const MAX_SCALE = 3

interface Position {
  x: number
  y: number
}

interface ImageSize {
  width: number
  height: number
}

export interface AvatarEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (imageDataUrl: string) => void
}

export function AvatarEditor({
  open,
  onOpenChange,
  onConfirm,
}: AvatarEditorProps) {
  const [imageSrc, setImageSrc] = React.useState<string | null>(null)
  const [naturalSize, setNaturalSize] = React.useState<ImageSize | null>(null)
  const [scale, setScale] = React.useState<number>(1)
  const [position, setPosition] = React.useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const [isDragOver, setIsDragOver] = React.useState(false)

  const imageRef = React.useRef<HTMLImageElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const dragStartRef = React.useRef<
    { x: number; y: number; position: Position } | null
  >(null)

  const coverScale = React.useMemo(() => {
    if (!naturalSize) return 1
    return Math.max(
      PREVIEW_SIZE / naturalSize.width,
      PREVIEW_SIZE / naturalSize.height
    )
  }, [naturalSize])

  const minScale = React.useMemo(() => {
    return Math.max(0.1, coverScale)
  }, [coverScale])

  const clampPosition = React.useCallback(
    (pos: Position, size: ImageSize, s: number): Position => {
      const minX = PREVIEW_SIZE - size.width * s
      const minY = PREVIEW_SIZE - size.height * s
      return {
        x: Math.min(0, Math.max(minX, pos.x)),
        y: Math.min(0, Math.max(minY, pos.y)),
      }
    },
    []
  )

  const centerPosition = React.useCallback(
    (size: ImageSize, s: number) => {
      const x = (PREVIEW_SIZE - size.width * s) / 2
      const y = (PREVIEW_SIZE - size.height * s) / 2
      setPosition(clampPosition({ x, y }, size, s))
    },
    [clampPosition]
  )

  const resetState = React.useCallback(() => {
    setImageSrc(null)
    setNaturalSize(null)
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setIsDragging(false)
    setIsDragOver(false)
    dragStartRef.current = null
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  React.useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  React.useEffect(() => {
    if (!naturalSize) return
    setScale((prev) => Math.max(minScale, Math.min(MAX_SCALE, prev)))
  }, [minScale, naturalSize])

  React.useEffect(() => {
    if (!naturalSize) return
    setPosition((prev) => clampPosition(prev, naturalSize, scale))
  }, [scale, naturalSize, clampPosition])

  const readFile = React.useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result === "string") {
        setImageSrc(result)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        readFile(file)
      }
    },
    [readFile]
  )

  const handleImageLoad = React.useCallback(() => {
    const img = imageRef.current
    if (!img) return
    const size = { width: img.naturalWidth, height: img.naturalHeight }
    const nextCoverScale = Math.max(
      PREVIEW_SIZE / size.width,
      PREVIEW_SIZE / size.height
    )
    const nextMinScale = Math.max(0.1, nextCoverScale)
    const initialScale = Math.max(nextMinScale, 1)

    setNaturalSize(size)
    setScale(initialScale)
    centerPosition(size, initialScale)
  }, [centerPosition])

  const handleImageError = React.useCallback(() => {
    resetState()
  }, [resetState])

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setIsDragOver(true)
    },
    []
  )

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setIsDragOver(false)
    },
    []
  )

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const file = event.dataTransfer.files?.[0]
      if (file) {
        readFile(file)
      }
    },
    [readFile]
  )

  const startDrag = React.useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true)
      dragStartRef.current = {
        x: clientX,
        y: clientY,
        position: { ...position },
      }
    },
    [position]
  )

  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      startDrag(event.clientX, event.clientY)
    },
    [startDrag]
  )

  const handleTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      event.preventDefault()
      const touch = event.touches[0]
      startDrag(touch.clientX, touch.clientY)
    },
    [startDrag]
  )

  React.useEffect(() => {
    if (!isDragging) return

    const handleMove = (clientX: number, clientY: number) => {
      const start = dragStartRef.current
      if (!start || !naturalSize) return
      const deltaX = clientX - start.x
      const deltaY = clientY - start.y
      setPosition(
        clampPosition(
          {
            x: start.position.x + deltaX,
            y: start.position.y + deltaY,
          },
          naturalSize,
          scale
        )
      )
    }

    const onMouseMove = (event: MouseEvent) => handleMove(event.clientX, event.clientY)
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      handleMove(touch.clientX, touch.clientY)
    }
    const onEnd = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onEnd)
    window.addEventListener("touchmove", onTouchMove)
    window.addEventListener("touchend", onEnd)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onEnd)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onEnd)
    }
  }, [isDragging, naturalSize, scale, clampPosition])

  const handleConfirm = React.useCallback(() => {
    if (!imageSrc || !imageRef.current || !naturalSize) return

    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = imageRef.current
    const sx = -position.x / scale
    const sy = -position.y / scale
    const sSize = PREVIEW_SIZE / scale

    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    const dataUrl = canvas.toDataURL("image/png")
    onConfirm(dataUrl)
    onOpenChange(false)
  }, [imageSrc, naturalSize, position, scale, onConfirm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑头像</DialogTitle>
          <DialogDescription>
            上传图片并调整缩放与位置，生成方形头像。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {!imageSrc ? (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-8 text-center transition-colors duration-150 ease-out",
                isDragOver
                  ? "border-primary bg-accent"
                  : "border-border bg-muted/30 hover:border-primary hover:bg-accent"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChange}
                aria-label="选择图片文件"
              />
              <span className="text-sm text-muted-foreground">
                点击或拖拽上传图片
              </span>
              <span className="text-xs text-muted-foreground">
                支持 JPG、PNG、GIF 等格式
              </span>
            </label>
          ) : (
            <>
              <div
                className={cn(
                  "relative mx-auto h-64 w-64 overflow-hidden rounded-sm border border-border bg-card",
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                role="img"
                aria-label="头像裁剪预览，可拖拽调整位置"
              >
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="头像预览"
                  className="absolute left-0 top-0 max-w-none origin-top-left touch-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    width: naturalSize ? naturalSize.width : "auto",
                    height: naturalSize ? naturalSize.height : "auto",
                  }}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-border" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">缩放</span>
                  <span className="text-xs font-medium tabular-nums">
                    {scale.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[scale]}
                  min={minScale}
                  max={MAX_SCALE}
                  step={0.01}
                  onValueChange={(values) =>
                    setScale(values[0] ?? minScale)
                  }
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setImageSrc(null)
                  setNaturalSize(null)
                  setScale(1)
                  setPosition({ x: 0, y: 0 })
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ""
                  }
                }}
              >
                重新选择
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!imageSrc}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
