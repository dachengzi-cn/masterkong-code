// 销售/业代相关字段的展示格式化工具
// 业务数据中姓名常携带数字工号或字母编码（如 "张三千12345"、"001张三丰"），
// 表格展示时仅保留汉字姓名部分，隐藏数字编码；原始值仍保留用于排序、下钻与导出。

const CHINESE_AND_SEPARATOR = /[^\u4e00-\u9fa5·\s]/g;

/**
 * 仅保留汉字姓名部分（含间隔符 ·），去除数字、字母等编码字符。
 * 若提取后为空则返回原始值，避免数据丢失。
 */
export function extractChineseName(raw: string | undefined | null): string {
  if (!raw) return '';
  const cleaned = raw.replace(CHINESE_AND_SEPARATOR, '').replace(/\s+/g, '').trim();
  return cleaned.length > 0 ? cleaned : raw;
}
