"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getLatencyColor,
  getLatencyLevel,
  getLatencyLabel,
  getStabilityLabel,
  formatBytes,
  type ModelTestResult,
} from "@/lib/ai/model-status"
import { cn } from "@/lib/utils"

interface ModelStatusIndicatorProps {
  result?: ModelTestResult
  size?: "sm" | "md"
  className?: string
}

export function ModelStatusIndicator({
  result,
  size = "sm",
  className,
}: ModelStatusIndicatorProps) {
  const dotSize = size === "sm" ? "size-2" : "size-2.5"

  if (!result || result.status === 'idle') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block shrink-0 rounded-full bg-muted-foreground/40",
              dotSize,
              className,
            )}
            aria-label="未测试"
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">未测试</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (result.status === 'testing') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block shrink-0 animate-pulse rounded-full bg-[hsl(38,85%,48%)]",
              dotSize,
              className,
            )}
            aria-label="测试中"
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">测试中...</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (result.status === 'error') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block shrink-0 rounded-full bg-muted-foreground/40",
              dotSize,
              className,
            )}
            aria-label="连接失败"
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-destructive">连接失败</p>
            {result.errorMessage && (
              <p className="text-muted-foreground">{result.errorMessage}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  // success
  const level = getLatencyLevel(result.latencyMs)
  const color = getLatencyColor(level)
  const label = getLatencyLabel(level)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block shrink-0 rounded-full",
            color,
            dotSize,
            className,
          )}
          aria-label={label}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          <p className="font-medium">状态：{label}</p>
          <p>延迟：{result.latencyMs ?? '-'}ms</p>
          {result.statusCode && <p>HTTP：{result.statusCode}</p>}
          {result.contentLength !== undefined && (
            <p>数据包：{formatBytes(result.contentLength)}</p>
          )}
          <p>稳定性：{getStabilityLabel(result.latencyMs)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
