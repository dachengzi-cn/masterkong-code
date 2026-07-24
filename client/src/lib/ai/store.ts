import type { AiConfig, AiModelEntry, AiModelStore, AiProviderId } from './types';

const LEGACY_STORAGE_KEY = 'app-ai-config';
const STORAGE_KEY = 'app-ai-models';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createModelFromConfig(config: AiConfig, name?: string): AiModelEntry {
  return {
    id: generateId(),
    name: name ?? getDefaultModelName(config.providerId),
    providerId: config.providerId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}

function getDefaultModelName(providerId: AiProviderId): string {
  switch (providerId) {
    case 'openai':
      return 'OpenAI 模型';
    case 'deepseek':
      return 'DeepSeek 模型';
    case 'anthropic':
      return 'Anthropic 模型';
    case 'custom':
      return '自定义模型';
    default:
      return '未命名模型';
  }
}

function isModelEntry(value: unknown): value is AiModelEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.providerId === 'string' &&
    typeof entry.apiKey === 'string' &&
    typeof entry.baseUrl === 'string' &&
    typeof entry.model === 'string'
  );
}

function isModelStore(value: unknown): value is AiModelStore {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const store = value as Record<string, unknown>;
  return (
    Array.isArray(store.models) &&
    store.models.every(isModelEntry) &&
    (store.activeModelId === undefined || typeof store.activeModelId === 'string')
  );
}

function isLegacyConfig(value: unknown): value is AiConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const config = value as Record<string, unknown>;
  return (
    typeof config.providerId === 'string' &&
    typeof config.apiKey === 'string' &&
    typeof config.baseUrl === 'string' &&
    typeof config.model === 'string'
  );
}

function createDefaultStore(): AiModelStore {
  return {
    models: [],
    activeModelId: '',
  };
}

export function loadModelStore(): AiModelStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isModelStore(parsed)) {
        return parsed;
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as unknown;
      if (isLegacyConfig(parsed)) {
        const model = createModelFromConfig(parsed);
        const store: AiModelStore = {
          models: [model],
          activeModelId: model.id,
        };
        saveModelStore(store);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return store;
      }
    }
  } catch {
    // 忽略损坏的存储数据
  }

  return createDefaultStore();
}

export function saveModelStore(store: AiModelStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function addModel(store: AiModelStore, model: AiModelEntry): AiModelStore {
  const next: AiModelStore = {
    models: [...store.models, model],
    activeModelId: store.activeModelId || model.id,
  };
  saveModelStore(next);
  return next;
}

export function updateModel(
  store: AiModelStore,
  modelId: string,
  updates: Partial<Omit<AiModelEntry, 'id'>>,
): AiModelStore {
  const next: AiModelStore = {
    ...store,
    models: store.models.map((model) =>
      model.id === modelId ? { ...model, ...updates } : model,
    ),
  };
  saveModelStore(next);
  return next;
}

export function deleteModel(store: AiModelStore, modelId: string): AiModelStore {
  const remaining = store.models.filter((model) => model.id !== modelId);
  const next: AiModelStore = {
    models: remaining,
    activeModelId:
      store.activeModelId === modelId
        ? remaining[0]?.id ?? ''
        : store.activeModelId,
  };
  saveModelStore(next);
  return next;
}

export function setActiveModel(store: AiModelStore, modelId: string): AiModelStore {
  const next: AiModelStore = {
    ...store,
    activeModelId: modelId,
  };
  saveModelStore(next);
  return next;
}
