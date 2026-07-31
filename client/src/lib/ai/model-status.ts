import type { AiConnectionStatus } from './types'

export type ModelLatencyLevel = 'excellent' | 'good' | 'poor' | 'untested'

export interface ModelTestResult {
  configKey: string
  status: AiConnectionStatus
  latencyMs?: number
  statusCode?: number
  contentLength?: number
  errorMessage?: string
  testedAt: number
}

export function getLatencyLevel(latencyMs: number | undefined): ModelLatencyLevel {
  if (latencyMs === undefined) return 'untested'
  if (latencyMs <= 500) return 'excellent'
  if (latencyMs <= 2000) return 'good'
  return 'poor'
}

export function getLatencyColor(level: ModelLatencyLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-[hsl(152,60%,42%)]'
    case 'good':
      return 'bg-[hsl(38,85%,48%)]'
    case 'poor':
      return 'bg-[hsl(4,72%,52%)]'
    case 'untested':
      return 'bg-muted-foreground/40'
  }
}

export function getLatencyLabel(level: ModelLatencyLevel): string {
  switch (level) {
    case 'excellent':
      return '优秀'
    case 'good':
      return '良好'
    case 'poor':
      return '延迟高'
    case 'untested':
      return '未测试'
  }
}

export function getLatencyDescription(result: ModelTestResult): string {
  if (result.status === 'error') {
    return `连接失败${result.errorMessage ? `：${result.errorMessage}` : ''}`
  }
  if (result.status === 'testing') {
    return '测试中...'
  }
  if (result.status === 'idle' || result.latencyMs === undefined) {
    return '未测试'
  }

  const level = getLatencyLevel(result.latencyMs)
  const label = getLatencyLabel(level)
  const lines = [
    `状态：${label}`,
    `延迟：${result.latencyMs}ms`,
  ]
  if (result.statusCode) {
    lines.push(`HTTP：${result.statusCode}`)
  }
  if (result.contentLength !== undefined) {
    lines.push(`数据包：${formatBytes(result.contentLength)}`)
  }
  lines.push(`稳定性：${getStabilityLabel(result.latencyMs)}`)
  return lines.join('\n')
}

export function getStabilityLabel(latencyMs: number | undefined): string {
  if (latencyMs === undefined) return '未知'
  if (latencyMs <= 500) return '稳定'
  if (latencyMs <= 2000) return '一般'
  return '不稳定'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function getBatchTestSummary(results: ModelTestResult[]): {
  total: number
  success: number
  failed: number
  avgLatency: number
  maxLatency: number
  minLatency: number
} {
  const total = results.length
  const successResults = results.filter((r) => r.status === 'success' && r.latencyMs !== undefined)
  const failed = results.filter((r) => r.status === 'error').length
  const latencies = successResults.map((r) => r.latencyMs!).filter((v): v is number => v !== undefined)
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
    : 0
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0

  return {
    total,
    success: successResults.length,
    failed,
    avgLatency,
    maxLatency,
    minLatency,
  }
}
