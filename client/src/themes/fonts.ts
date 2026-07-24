export interface FontOption {
  id: string;
  name: string;
  family: string;
  cdnUrl?: string;
}

export const fontOptions: FontOption[] = [
  {
    id: 'source-han-sans',
    name: '思源黑体',
    family:
      '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    cdnUrl:
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap',
  },
  {
    id: 'pingfang-sc',
    name: '苹方',
    family:
      '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  {
    id: 'microsoft-yahei',
    name: '微软雅黑',
    family:
      '"Microsoft YaHei", "PingFang SC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  {
    id: 'harmonyos-sans',
    name: '鸿蒙黑体',
    family:
      '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'misans',
    name: '小米兰亭',
    family: '"MiSans", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'oppo-sans',
    name: 'OPPO Sans',
    family: '"OPPO Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'alibaba-puhuiti',
    name: '阿里巴巴普惠体',
    family:
      '"Alibaba PuHuiTi", "PingFang SC", "Microsoft YaHei", sans-serif',
    cdnUrl:
      'https://chinese-font.netlify.app/packages/alipuhui/dist/Alibaba-PuHuiTi-Regular/result.css',
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷',
    family: '"LXGW WenKai", "PingFang SC", "Microsoft YaHei", serif',
    cdnUrl:
      'https://chinese-font.netlify.app/packages/lxgwwenkai/dist/LXGWWenKai-Regular/result.css',
  },
  {
    id: 'smiley-sans',
    name: '得意黑',
    family: '"Smiley Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
    cdnUrl:
      'https://chinese-font.netlify.app/packages/dyh/dist/SmileySans-Oblique/result.css',
  },
  {
    id: 'zcool-kuaile',
    name: '站酷快乐体',
    family: '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif',
    cdnUrl:
      'https://chinese-font.netlify.app/packages/zkkl/dist/ZCOOLKuaiLe-Regular/result.css',
  },
  {
    id: 'youshe-biaotihei',
    name: '优设标题黑',
    family:
      '"YouSheBiaoTiHei", "PingFang SC", "Microsoft YaHei", sans-serif',
    cdnUrl:
      'https://chinese-font.netlify.app/packages/ysbth/dist/YouSheBiaoTiHei-Regular/result.css',
  },
  {
    id: 'source-han-serif',
    name: '思源宋体',
    family:
      '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
    cdnUrl:
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap',
  },
];
