import type { DocCategory } from './doc-gen.types';

/** 文档分类标签 */
export const DOC_CATEGORY_LABELS: Partial<Record<DocCategory, string>> = {
  'model-strategy': '模型调用策略',
};

/** 所有分类列表（仅保留 AI 分析技能相关内容） */
export const ALL_CATEGORIES: DocCategory[] = [
  'model-strategy',
];

/** 默认文档 docKey 映射 */
export const DEFAULT_DOC_KEYS: Partial<Record<DocCategory, string>> = {
  'model-strategy': 'ai-design-model-strategy',
};
