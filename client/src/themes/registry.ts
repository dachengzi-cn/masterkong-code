import type { Theme } from './types';

export const themes: Theme[] = [
  {
    id: 'default',
    name: '默认 (Default)',
    preview: 'hsl(217, 85%, 52%)',
  },
  {
    id: 'apple',
    name: 'Apple',
    preview: '#0066cc',
  },
  {
    id: 'claude',
    name: 'Claude',
    preview: '#cc785c',
  },
  {
    id: 'figma',
    name: 'Figma',
    preview: '#000000',
  },
  {
    id: 'ibm',
    name: 'IBM Carbon',
    preview: '#0f62fe',
  },
  {
    id: 'xai',
    name: 'xAI',
    preview: '#ff7a17',
  },
  {
    id: 'notion',
    name: 'Notion',
    preview: '#5645d4',
  },
  {
    id: 'meta',
    name: 'Meta',
    preview: '#0064e0',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    preview: '#1c1c1c',
  },
  {
    id: 'mastercard',
    name: 'Mastercard',
    preview: '#141413',
  },
];

export const defaultTheme: Theme = themes[0];
