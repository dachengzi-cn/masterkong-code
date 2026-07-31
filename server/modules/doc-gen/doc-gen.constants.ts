import type { DocCategory } from './doc-gen.types';

/** 文档分类标签 */
export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  overview: '系统总览',
  architecture: '系统架构',
  modules: '功能模块',
  api: '接口定义',
  'data-flow': '数据流程',
  'ui-design': 'UI 设计规范',
  'model-strategy': '模型调用策略',
};

/** 所有分类列表 */
export const ALL_CATEGORIES: DocCategory[] = [
  'overview',
  'architecture',
  'modules',
  'api',
  'data-flow',
  'ui-design',
  'model-strategy',
];

/** 默认文档 docKey 映射 */
export const DEFAULT_DOC_KEYS: Record<DocCategory, string> = {
  overview: 'ai-design-overview',
  architecture: 'ai-design-architecture',
  modules: 'ai-design-modules',
  api: 'ai-design-api',
  'data-flow': 'ai-design-data-flow',
  'ui-design': 'ai-design-ui-design',
  'model-strategy': 'ai-design-model-strategy',
};
