import type { Theme } from './types';

export const themes: Theme[] = [
  {
    id: 'default',
    name: '极光蓝',
    preview: 'hsl(217, 85%, 52%)',
  },
  {
    id: 'apple',
    name: '加州晴空',
    preview: '#0066cc',
  },
  {
    id: 'claude',
    name: '琥珀暖阳',
    preview: '#cc785c',
  },
  {
    id: 'figma',
    name: '墨韵极简',
    preview: '#000000',
  },
  {
    id: 'ibm',
    name: '碳素蓝',
    preview: '#0f62fe',
  },
  {
    id: 'xai',
    name: '暗夜星河',
    preview: '#ff7a17',
  },
  {
    id: 'notion',
    name: '紫罗兰',
    preview: '#5645d4',
  },
  {
    id: 'meta',
    name: '天际蓝',
    preview: '#0064e0',
  },
  {
    id: 'lovable',
    name: '奶油书卷',
    preview: '#1c1c1c',
  },
  {
    id: 'mastercard',
    name: '黑金典雅',
    preview: '#141413',
  },
  {
    id: 'custom',
    name: '自定义配色',
    preview: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #22c55e 100%)',
    custom: true,
  },
];

export const defaultTheme: Theme = themes[0];
