import * as React from "react"

import * as aiConfigApi from "@/api/ai-config"
import { testConnection } from "@/lib/ai/client"
import type { AiConfig, AiTestError } from "@/lib/ai/types"
import type { ModelTestResult } from "@/lib/ai/model-status"

/**
 * Module-level test store — survives component unmount.
 * Tests continue running in the background even when the settings panel
 * is closed or the user switches sections.
 */

interface BatchState {
  builtin: { testing: boolean; current: number; total: number }
  custom: { testing: boolean; current: number; total: number }
}

interface TestStoreState {
  results: Map<string, ModelTestResult>
  batch: BatchState
}

let state: TestStoreState = {
  results: new Map(),
  batch: {
    builtin: { testing: false, current: 0, total: 0 },
    custom: { testing: false, current: 0, total: 0 },
  },
}

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function setState(updater: (prev: TestStoreState) => TestStoreState) {
  state = updater(state)
  notify()
}

// ── Public read API ──────────────────────────────────────────────────

export function getTestResult(configKey: string): ModelTestResult | undefined {
  return state.results.get(configKey)
}

export function getAllTestResults(): Map<string, ModelTestResult> {
  return state.results
}

export function getBatchState(): BatchState {
  return state.batch
}

// ── Subscription hook ────────────────────────────────────────────────

export function useTestStore(): TestStoreState {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

  React.useEffect(() => {
    listeners.add(forceUpdate)
    return () => {
      listeners.delete(forceUpdate)
    }
  }, [])

  return state
}

// ── Result management ────────────────────────────────────────────────

export function clearTestResult(configKey: string) {
  setState((prev) => {
    const next = new Map(prev.results)
    next.delete(configKey)
    return { ...prev, results: next }
  })
}

export function clearAllResults() {
  setState((prev) => ({
    ...prev,
    results: new Map(),
  }))
}

// ── Test execution (module-level, survives unmount) ──────────────────

export function runBuiltinTest(configKey: string): Promise<void> {
  setState((prev) => {
    const next = new Map(prev.results)
    next.set(configKey, {
      configKey,
      status: "testing",
      testedAt: Date.now(),
    })
    return { ...prev, results: next }
  })

  return aiConfigApi
    .testAiModelConfig(configKey, {
      messages: [{ role: "user", content: "你好" }],
      maxTokens: 100,
    })
    .then((response) => {
      if (response.ok) {
        const contentLength = response.content
          ? new Blob([response.content]).size
          : 0
        setState((prev) => {
          const next = new Map(prev.results)
          next.set(configKey, {
            configKey,
            status: "success",
            latencyMs: response.metrics?.latencyMs,
            statusCode: response.metrics?.statusCode,
            contentLength,
            testedAt: Date.now(),
          })
          return { ...prev, results: next }
        })
      } else {
        setState((prev) => {
          const next = new Map(prev.results)
          next.set(configKey, {
            configKey,
            status: "error",
            errorMessage: response.error ?? "连接失败",
            latencyMs: response.metrics?.latencyMs,
            statusCode: response.metrics?.statusCode,
            testedAt: Date.now(),
          })
          return { ...prev, results: next }
        })
      }
    })
    .catch((error: unknown) => {
      setState((prev) => {
        const next = new Map(prev.results)
        next.set(configKey, {
          configKey,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "连接测试失败",
          testedAt: Date.now(),
        })
        return { ...prev, results: next }
      })
    })
}

export async function runBuiltinBatchTest(
  configKeys: string[],
): Promise<void> {
  if (configKeys.length === 0) return

  // Prevent duplicate batch runs
  if (state.batch.builtin.testing) return

  setState((prev) => ({
    ...prev,
    batch: {
      ...prev.batch,
      builtin: { testing: true, current: 0, total: configKeys.length },
    },
  }))

  for (let i = 0; i < configKeys.length; i++) {
    setState((prev) => ({
      ...prev,
      batch: {
        ...prev.batch,
        builtin: { testing: true, current: i + 1, total: configKeys.length },
      },
    }))
    await runBuiltinTest(configKeys[i])
  }

  setState((prev) => ({
    ...prev,
    batch: {
      ...prev.batch,
      builtin: { testing: false, current: 0, total: 0 },
    },
  }))
}

export function runCustomTest(
  modelId: string,
  config: AiConfig,
): Promise<void> {
  setState((prev) => {
    const next = new Map(prev.results)
    next.set(modelId, {
      configKey: modelId,
      status: "testing",
      testedAt: Date.now(),
    })
    return { ...prev, results: next }
  })

  return testConnection(config)
    .then((response) => {
      if (response.ok === true) {
        const contentLength = response.content
          ? new Blob([response.content]).size
          : 0
        setState((prev) => {
          const next = new Map(prev.results)
          next.set(modelId, {
            configKey: modelId,
            status: "success",
            latencyMs: response.metrics.latencyMs,
            statusCode: response.metrics.statusCode,
            contentLength,
            testedAt: Date.now(),
          })
          return { ...prev, results: next }
        })
      } else {
        const err = response as AiTestError
        setState((prev) => {
          const next = new Map(prev.results)
          next.set(modelId, {
            configKey: modelId,
            status: "error",
            errorMessage: err.error,
            latencyMs: err.metrics?.latencyMs,
            statusCode: err.metrics?.statusCode,
            testedAt: Date.now(),
          })
          return { ...prev, results: next }
        })
      }
    })
    .catch((error: unknown) => {
      setState((prev) => {
        const next = new Map(prev.results)
        next.set(modelId, {
          configKey: modelId,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "连接测试失败",
          testedAt: Date.now(),
        })
        return { ...prev, results: next }
      })
    })
}

export async function runCustomBatchTest(
  models: Array<{ id: string; config: AiConfig }>,
): Promise<void> {
  if (models.length === 0) return

  if (state.batch.custom.testing) return

  setState((prev) => ({
    ...prev,
    batch: {
      ...prev.batch,
      custom: { testing: true, current: 0, total: models.length },
    },
  }))

  for (let i = 0; i < models.length; i++) {
    setState((prev) => ({
      ...prev,
      batch: {
        ...prev.batch,
        custom: { testing: true, current: i + 1, total: models.length },
      },
    }))
    await runCustomTest(models[i].id, models[i].config)
  }

  setState((prev) => ({
    ...prev,
    batch: {
      ...prev.batch,
      custom: { testing: false, current: 0, total: 0 },
    },
  }))
}
