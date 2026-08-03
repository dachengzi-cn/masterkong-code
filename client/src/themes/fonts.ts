export interface FontOption {
  id: string;
  name: string;
  family: string;
  cdnUrl?: string;
}

// 仅使用操作系统自带的基础字体，无需 CDN 加载，切换即可生效。
// 每个字体优先指定对应系统的字体名，确保跨平台可命中且不互相回退掩盖差异。
export const fontOptions: FontOption[] = [
  {
    id: 'system-default',
    name: '系统默认',
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'pingfang',
    name: '苹方',
    family: '"PingFang SC", "PingFang TC", "Hiragino Sans GB", sans-serif',
  },
  {
    id: 'microsoft-yahei',
    name: '微软雅黑',
    family: '"Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  },
  {
    id: 'simhei',
    name: '黑体',
    family: 'SimHei, "Heiti SC", "PingFang SC", sans-serif',
  },
  {
    id: 'simsun',
    name: '宋体',
    family: 'SimSun, "Songti SC", "STSong", serif',
  },
  {
    id: 'kaiti',
    name: '楷体',
    family: 'KaiTi, "Kaiti SC", "STKaiti", "PingFang SC", serif',
  },
  {
    id: 'fangsong',
    name: '仿宋',
    family: 'FangSong, "FangSong_GB2312", "STFangsong", "PingFang SC", serif',
  },
  {
    id: 'arial',
    name: 'Arial',
    family: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    id: 'helvetica',
    name: 'Helvetica',
    family: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: 'times-new-roman',
    name: 'Times New Roman',
    family: '"Times New Roman", Times, "Songti SC", serif',
  },
];
