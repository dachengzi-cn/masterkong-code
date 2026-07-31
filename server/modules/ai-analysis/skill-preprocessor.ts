import { Injectable, Logger } from '@nestjs/common';
import type {
  DataPreprocessReport,
  DataQualityLevel,
  DataAnomaly,
} from './skill-benchmark.types';

/**
 * M3-2a: Skill 数据预处理器
 * 职责：
 * 1. 输入数据规范化（字段标准化、类型一致性、空值处理）
 * 2. 异常值检测（空数据集、缺失关键字段、类型不匹配、异常值）
 * 3. 数据质量评分（0-100 分，分级 excellent/good/fair/poor/empty）
 * 4. 智能截断（基于 token 预算，保留高价值数据）
 * 5. 生成数据摘要（供模型理解的精简描述）
 */
@Injectable()
export class SkillPreprocessor {
  private readonly logger = new Logger(SkillPreprocessor.name);

  /** 各页面预期的关键字段（用于缺失检测） */
  private readonly REQUIRED_FIELDS_BY_PAGE: Record<string, string[]> = {
    cumulative: ['trend', 'representatives', 'unconvertedStores'],
    daily: ['dailyTrend', 'representatives', 'weekendEffect'],
    'brand-spec': ['brands', 'specs', 'combinations'],
    expiry: ['monthlyTrend', 'regionalDistribution', 'specConcentration'],
    atp: ['feeRatioDistribution', 'representatives', 'salesLayer'],
  };

  /** 各字段对应的类型映射（用于类型校验） */
  private readonly FIELD_TYPE_MAP: Record<string, 'array' | 'object' | 'number' | 'string'> = {
    trend: 'array',
    representatives: 'array',
    unconvertedStores: 'array',
    dailyTrend: 'array',
    weekendEffect: 'object',
    brands: 'array',
    specs: 'array',
    combinations: 'array',
    monthlyTrend: 'array',
    regionalDistribution: 'array',
    specConcentration: 'array',
    feeRatioDistribution: 'object',
    salesLayer: 'object',
    summary: 'string',
    totalAmount: 'number',
    totalCount: 'number',
    avgRate: 'number',
  };

  /** 数据截断的字符上限（基于 token 预算，约 1 token = 2.5 中文字符） */
  private readonly MAX_DATA_CHARS = 8000;
  private readonly MAX_ARRAY_ITEMS = 100;
  private readonly MAX_STRING_LENGTH = 2000;

  /**
   * 预处理输入数据
   * @param inputData 原始输入数据
   * @param pageScope 页面范围（用于字段期望检测）
   */
  preprocess(
    inputData: Record<string, unknown>,
    pageScope?: string,
  ): DataPreprocessReport {
    const anomalies: DataAnomaly[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. 空数据检测
    if (!inputData || typeof inputData !== 'object' || Object.keys(inputData).length === 0) {
      return {
        quality: 'empty',
        score: 0,
        recordCount: 0,
        fieldCount: 0,
        anomalies: [
          {
            type: 'empty_dataset',
            description: '输入数据为空，无法执行分析',
            severity: 'high',
          },
        ],
        summary: '数据为空',
        normalizedData: {},
        warnings,
        errors: ['输入数据为空'],
      };
    }

    const fieldCount = Object.keys(inputData).length;
    let recordCount = 0;

    // 2. 规范化数据（类型修正、空值清理、截断）
    const normalizedData = this.normalizeData(inputData, anomalies, warnings);

    // 3. 检测记录数（尝试从数组字段推断）
    recordCount = this.estimateRecordCount(normalizedData);

    // 4. 关键字段缺失检测
    if (pageScope) {
      this.checkRequiredFields(normalizedData, pageScope, anomalies, warnings);
    }

    // 5. 类型一致性检测
    this.checkTypeConsistency(normalizedData, anomalies, warnings);

    // 6. 异常值检测
    this.detectOutliers(normalizedData, anomalies, warnings);

    // 7. 评分计算
    const score = this.calculateScore(anomalies, fieldCount, recordCount);
    const quality = this.scoreToLevel(score, recordCount);

    // 8. 生成摘要
    const summary = this.generateSummary(normalizedData, pageScope, recordCount, fieldCount);

    // 9. 高严重度异常转为错误
    for (const anomaly of anomalies) {
      if (anomaly.severity === 'high') {
        errors.push(`${anomaly.type}${anomaly.field ? `(${anomaly.field})` : ''}: ${anomaly.description}`);
      }
    }

    return {
      quality,
      score,
      recordCount,
      fieldCount,
      anomalies,
      summary,
      normalizedData,
      warnings,
      errors,
    };
  }

  /**
   * 规范化数据：类型修正、空值清理、智能截断
   */
  private normalizeData(
    data: Record<string, unknown>,
    anomalies: DataAnomaly[],
    warnings: string[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let wasTruncated = false;

    for (const [key, value] of Object.entries(data)) {
      // 跳过 null/undefined
      if (value === null || value === undefined) {
        warnings.push(`字段 "${key}" 为空，已跳过`);
        continue;
      }

      // 字符串过长截断
      if (typeof value === 'string' && value.length > this.MAX_STRING_LENGTH) {
        result[key] = value.slice(0, this.MAX_STRING_LENGTH) + '...[截断]';
        warnings.push(`字段 "${key}" 字符串过长，已截断至 ${this.MAX_STRING_LENGTH} 字符`);
        wasTruncated = true;
        continue;
      }

      // 数组过长截断
      if (Array.isArray(value) && value.length > this.MAX_ARRAY_ITEMS) {
        result[key] = value.slice(0, this.MAX_ARRAY_ITEMS);
        warnings.push(
          `字段 "${key}" 数组过长（${value.length} 项），已截断至前 ${this.MAX_ARRAY_ITEMS} 项`,
        );
        wasTruncated = true;
        continue;
      }

      // 对象递归规范化（仅一层）
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nestedResult: Record<string, unknown> = {};
        for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
          if (nestedValue === null || nestedValue === undefined) continue;
          if (
            typeof nestedValue === 'string' &&
            nestedValue.length > this.MAX_STRING_LENGTH
          ) {
            nestedResult[nestedKey] = nestedValue.slice(0, this.MAX_STRING_LENGTH) + '...[截断]';
            wasTruncated = true;
          } else if (
            Array.isArray(nestedValue) &&
            nestedValue.length > this.MAX_ARRAY_ITEMS
          ) {
            nestedResult[nestedKey] = nestedValue.slice(0, this.MAX_ARRAY_ITEMS);
            wasTruncated = true;
          } else {
            nestedResult[nestedKey] = nestedValue;
          }
        }
        result[key] = nestedResult;
        continue;
      }

      result[key] = value;
    }

    if (wasTruncated) {
      anomalies.push({
        type: 'data_truncated',
        description: '部分字段数据已截断以适配模型 token 预算',
        severity: 'low',
      });
    }

    return result;
  }

  /**
   * 估算记录数：从数组字段中取最大长度作为记录数
   */
  private estimateRecordCount(data: Record<string, unknown>): number {
    let maxCount = 0;
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > maxCount) {
        maxCount = value.length;
      }
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const nestedValue of Object.values(value as Record<string, unknown>)) {
          if (Array.isArray(nestedValue) && nestedValue.length > maxCount) {
            maxCount = nestedValue.length;
          }
        }
      }
    }
    return maxCount;
  }

  /**
   * 检测关键字段缺失
   */
  private checkRequiredFields(
    data: Record<string, unknown>,
    pageScope: string,
    anomalies: DataAnomaly[],
    warnings: string[],
  ): void {
    const required = this.REQUIRED_FIELDS_BY_PAGE[pageScope];
    if (!required) return;

    for (const field of required) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        anomalies.push({
          type: 'missing_required_field',
          field,
          description: `页面 "${pageScope}" 期望字段 "${field}" 缺失，可能影响分析完整性`,
          severity: 'medium',
        });
        warnings.push(`缺少关键字段: ${field}`);
      } else if (Array.isArray(data[field]) && (data[field] as unknown[]).length === 0) {
        anomalies.push({
          type: 'missing_required_field',
          field,
          description: `字段 "${field}" 为空数组`,
          severity: 'medium',
        });
      }
    }
  }

  /**
   * 检测类型一致性
   */
  private checkTypeConsistency(
    data: Record<string, unknown>,
    anomalies: DataAnomaly[],
    warnings: string[],
  ): void {
    for (const [key, value] of Object.entries(data)) {
      const expectedType = this.FIELD_TYPE_MAP[key];
      if (!expectedType) continue;

      const actualType = this.getTypeName(value);
      if (actualType !== expectedType) {
        anomalies.push({
          type: 'type_mismatch',
          field: key,
          description: `字段 "${key}" 期望类型 ${expectedType}，实际为 ${actualType}`,
          severity: 'medium',
        });
        warnings.push(`字段类型不匹配: ${key} (期望 ${expectedType}, 实际 ${actualType})`);
      }
    }
  }

  /**
   * 异常值检测：数值字段中的极端值
   */
  private detectOutliers(
    data: Record<string, unknown>,
    anomalies: DataAnomaly[],
    warnings: string[],
  ): void {
    for (const [key, value] of Object.entries(data)) {
      // 数值异常检测
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          anomalies.push({
            type: 'invalid_value',
            field: key,
            description: `字段 "${key}" 数值无效 (Infinity/NaN)`,
            severity: 'high',
          });
        } else if (Math.abs(value) > 1e10) {
          anomalies.push({
            type: 'outlier',
            field: key,
            description: `字段 "${key}" 数值过大 (${value})，可能是异常值`,
            severity: 'low',
          });
          warnings.push(`字段 ${key} 数值异常偏大`);
        }
      }

      // 百分比类字段范围检测
      if (
        typeof value === 'number' &&
        (key.toLowerCase().includes('rate') ||
          key.toLowerCase().includes('ratio') ||
          key.toLowerCase().includes('percent'))
      ) {
        if (value < 0 || value > 100) {
          anomalies.push({
            type: 'invalid_value',
            field: key,
            description: `百分比字段 "${key}" 数值 ${value} 超出 0-100 范围`,
            severity: 'medium',
          });
        }
      }

      // 数组项的一致性检测
      if (Array.isArray(value) && value.length > 0) {
        const firstItemType = typeof value[0];
        const inconsistentIndices: number[] = [];
        for (let i = 1; i < value.length; i++) {
          if (typeof value[i] !== firstItemType) {
            inconsistentIndices.push(i);
          }
        }
        if (inconsistentIndices.length > 0) {
          anomalies.push({
            type: 'inconsistent_format',
            field: key,
            description: `数组字段 "${key}" 存在 ${inconsistentIndices.length} 个类型不一致的项`,
            severity: 'low',
          });
        }
      }
    }
  }

  /**
   * 计算数据质量评分（0-100）
   */
  private calculateScore(
    anomalies: DataAnomaly[],
    fieldCount: number,
    recordCount: number,
  ): number {
    if (recordCount === 0 && fieldCount === 0) return 0;

    let score = 100;

    // 异常扣分
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'high':
          score -= 30;
          break;
        case 'medium':
          score -= 15;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }

    // 数据量过少扣分
    if (recordCount > 0 && recordCount < 5) {
      score -= 20;
    } else if (recordCount === 0 && fieldCount > 0) {
      score -= 30;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 评分转等级
   */
  private scoreToLevel(score: number, recordCount: number): DataQualityLevel {
    if (recordCount === 0) return 'empty';
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  /**
   * 生成数据摘要
   */
  private generateSummary(
    data: Record<string, unknown>,
    pageScope: string | undefined,
    recordCount: number,
    fieldCount: number,
  ): string {
    const parts: string[] = [];

    if (pageScope) {
      const pageNames: Record<string, string> = {
        cumulative: '累计成交分析',
        daily: '当日成交分析',
        'brand-spec': '品牌规格分析',
        expiry: '临期费用分析',
        atp: 'ATP费用分析',
      };
      parts.push(pageNames[pageScope] ?? pageScope);
    }

    parts.push(`包含 ${fieldCount} 个字段`);
    if (recordCount > 0) {
      parts.push(`${recordCount} 条记录`);
    }

    // 列出主要字段
    const mainFields = Object.keys(data).slice(0, 5);
    if (mainFields.length > 0) {
      parts.push(`主要字段: ${mainFields.join(', ')}`);
    }

    return parts.join('，');
  }

  /**
   * 获取值的类型名
   */
  private getTypeName(value: unknown): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }

  /**
   * 将预处理报告注入到输入数据中（供模型理解数据质量）
   */
  injectReportIntoData(
    data: Record<string, unknown>,
    report: DataPreprocessReport,
  ): Record<string, unknown> {
    return {
      ...data,
      _dataQuality: {
        quality: report.quality,
        score: report.score,
        recordCount: report.recordCount,
        summary: report.summary,
        warnings: report.warnings,
        anomalyCount: report.anomalies.length,
      },
    };
  }
}
