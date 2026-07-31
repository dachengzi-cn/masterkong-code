import { Injectable, Logger } from '@nestjs/common';
import type {
  OutputValidationReport,
  FieldValidationResult,
  ValidationLevel,
} from './skill-benchmark.types';

/**
 * M3-2b: Skill 结果校验器
 * 职责：
 * 1. 基于 Skill outputSchema 校验模型输出
 * 2. 检查必填字段、类型正确性、值范围
 * 3. 自动修复常见问题（缺失字段填充默认值）
 * 4. 生成结构化校验报告
 * 5. 兜底处理：校验失败时保留 rawContent
 */
@Injectable()
export class SkillValidator {
  private readonly logger = new Logger(SkillValidator.name);

  /** 各类型的默认修复值 */
  private readonly DEFAULT_VALUES: Record<string, unknown> = {
    string: '',
    number: 0,
    boolean: false,
    array: [],
    object: {},
  };

  /** 各页面输出的必填字段（用于严格校验） */
  private readonly REQUIRED_OUTPUT_FIELDS: Record<string, string[]> = {
    'cumulative-conversion-analysis': [
      'summary',
      'trendAnalysis',
      'recommendations',
      'riskAlerts',
    ],
    'daily-conversion-analysis': [
      'summary',
      'dailyTrend',
      'recommendations',
      'riskAlerts',
    ],
    'brand-spec-analysis': [
      'summary',
      'recommendations',
      'riskAlerts',
    ],
    'expiry-expense-analysis': [
      'summary',
      'trendAnalysis',
      'recommendations',
      'riskAlerts',
    ],
    'atp-expense-analysis': [
      'summary',
      'efficiencyOverview',
      'recommendations',
      'riskAlerts',
    ],
  };

  /**
   * 校验模型输出
   * @param parsedContent 模型解析后的 JSON 输出
   * @param outputSchema Skill 定义的输出 schema
   * @param skillKey Skill key（用于必填字段校验）
   */
  validate(
    parsedContent: Record<string, unknown> | null,
    outputSchema: Record<string, unknown>,
    skillKey?: string,
  ): OutputValidationReport {
    const fieldResults: FieldValidationResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. 空输出检测
    if (!parsedContent || typeof parsedContent !== 'object') {
      return {
        level: 'error',
        passedFields: 0,
        failedFields: 0,
        warningCount: 0,
        fieldResults: [
          {
            field: '_root',
            level: 'error',
            message: '模型输出为空或非对象',
          },
        ],
        repairedOutput: { rawContent: '', _validationError: '输出为空' },
        errors: ['模型输出为空或非对象'],
        warnings,
      };
    }

    let passedFields = 0;
    let failedFields = 0;
    let warningCount = 0;

    // 2. Schema 字段校验
    const schemaProperties = this.extractSchemaProperties(outputSchema);
    const repairedOutput: Record<string, unknown> = { ...parsedContent };

    for (const [field, fieldSchema] of Object.entries(schemaProperties)) {
      const result = this.validateField(field, parsedContent[field], fieldSchema);
      fieldResults.push(result);

      switch (result.level) {
        case 'pass':
          passedFields++;
          break;
        case 'warning':
          warningCount++;
          if (result.repaired && result.field) {
            repairedOutput[result.field] = this.getDefaultValue(fieldSchema);
          }
          break;
        case 'error':
          failedFields++;
          errors.push(`${result.field}: ${result.message}`);
          if (result.repaired && result.field) {
            repairedOutput[result.field] = this.getDefaultValue(fieldSchema);
          }
          break;
      }
    }

    // 3. 必填字段校验（基于 skillKey）
    if (skillKey) {
      const required = this.REQUIRED_OUTPUT_FIELDS[skillKey];
      if (required) {
        for (const field of required) {
          if (!(field in repairedOutput)) {
            const result: FieldValidationResult = {
              field,
              level: 'error',
              message: `必填字段缺失: ${field}`,
              repaired: true,
            };
            fieldResults.push(result);
            failedFields++;
            errors.push(`必填字段缺失: ${field}`);
            // 修复缺失的必填字段
            repairedOutput[field] = this.guessDefaultByFieldName(field);
          }
        }
      }
    }

    // 4. 业务逻辑校验
    this.validateBusinessLogic(repairedOutput, fieldResults, warnings, errors);
    warningCount += fieldResults.filter((r) => r.level === 'warning').length;
    failedFields += fieldResults.filter((r) => r.level === 'error').length - failedFields;
    if (failedFields < 0) failedFields = 0;

    // 5. 计算总等级
    const level = this.determineLevel(errors, warnings);

    return {
      level,
      passedFields,
      failedFields,
      warningCount,
      fieldResults,
      repairedOutput,
      errors,
      warnings,
    };
  }

  /**
   * 校验单个字段
   */
  private validateField(
    field: string,
    value: unknown,
    fieldSchema: Record<string, unknown>,
  ): FieldValidationResult {
    const expectedType = fieldSchema.type as string | undefined;

    // 字段不存在
    if (value === undefined || value === null) {
      return {
        field,
        level: 'warning',
        expectedType,
        actualType: 'undefined',
        message: `字段 "${field}" 缺失，已填充默认值`,
        repaired: true,
      };
    }

    // 类型校验
    if (expectedType) {
      const actualType = this.getTypeName(value);
      if (actualType !== expectedType) {
        // 尝试类型转换
        const converted = this.tryConvertType(value, expectedType);
        if (converted !== undefined) {
          return {
            field,
            level: 'warning',
            expectedType,
            actualType,
            message: `字段 "${field}" 类型从 ${actualType} 转换为 ${expectedType}`,
            repaired: true,
          };
        }
        return {
          field,
          level: 'error',
          expectedType,
          actualType,
          message: `字段 "${field}" 类型不匹配，期望 ${expectedType}，实际 ${actualType}`,
          repaired: true,
        };
      }
    }

    // 字符串长度校验
    if (typeof value === 'string' && expectedType === 'string') {
      if (value.length === 0) {
        return {
          field,
          level: 'warning',
          expectedType,
          actualType: 'string',
          message: `字段 "${field}" 为空字符串`,
        };
      }
      if (value.length > 5000) {
        return {
          field,
          level: 'warning',
          expectedType,
          actualType: 'string',
          message: `字段 "${field}" 字符串过长 (${value.length} 字符)`,
        };
      }
    }

    // 数组非空校验
    if (Array.isArray(value) && value.length === 0) {
      return {
        field,
        level: 'warning',
        expectedType: 'array',
        actualType: 'array',
        message: `字段 "${field}" 为空数组`,
      };
    }

    // 数组项数过多警告
    if (Array.isArray(value) && value.length > 50) {
      return {
        field,
        level: 'warning',
        expectedType: 'array',
        actualType: 'array',
        message: `字段 "${field}" 数组项数过多 (${value.length})`,
      };
    }

    return {
      field,
      level: 'pass',
      expectedType,
      actualType: this.getTypeName(value),
      message: '校验通过',
    };
  }

  /**
   * 业务逻辑校验：检查分析结果的合理性
   */
  private validateBusinessLogic(
    output: Record<string, unknown>,
    fieldResults: FieldValidationResult[],
    warnings: string[],
    errors: string[],
  ): void {
    // recommendations 应该是字符串数组
    if ('recommendations' in output) {
      const recs = output.recommendations;
      if (Array.isArray(recs)) {
        const invalidItems = recs.filter((r) => typeof r !== 'string');
        if (invalidItems.length > 0) {
          fieldResults.push({
            field: 'recommendations',
            level: 'warning',
            expectedType: 'array<string>',
            actualType: 'array<mixed>',
            message: 'recommendations 数组包含非字符串项',
          });
          warnings.push('recommendations 应为纯字符串数组');
        }
        if (recs.length === 0) {
          fieldResults.push({
            field: 'recommendations',
            level: 'warning',
            message: 'recommendations 为空，缺少行动建议',
          });
          warnings.push('缺少行动建议');
        } else if (recs.length > 10) {
          fieldResults.push({
            field: 'recommendations',
            level: 'warning',
            message: `recommendations 过多 (${recs.length})，建议精简至 3-5 条`,
          });
        }
      }
    }

    // riskAlerts 的 level 字段校验
    if ('riskAlerts' in output && Array.isArray(output.riskAlerts)) {
      const validLevels = ['high', 'medium', 'low'];
      for (let i = 0; i < output.riskAlerts.length; i++) {
        const alert = output.riskAlerts[i] as Record<string, unknown>;
        if (alert && typeof alert === 'object') {
          if (!('level' in alert)) {
            fieldResults.push({
              field: `riskAlerts[${i}].level`,
              level: 'warning',
              message: `风险预警 #${i + 1} 缺少 level 字段`,
            });
          } else if (!validLevels.includes(String(alert.level))) {
            fieldResults.push({
              field: `riskAlerts[${i}].level`,
              level: 'warning',
              message: `风险预警 #${i + 1} level 值无效: ${alert.level}`,
            });
          }
        }
      }
    }

    // summary 长度校验
    if ('summary' in output && typeof output.summary === 'string') {
      if (output.summary.length > 500) {
        fieldResults.push({
          field: 'summary',
          level: 'warning',
          message: `summary 过长 (${output.summary.length} 字符)，建议控制在 200 字以内`,
        });
        warnings.push('summary 过长');
      }
    }

    // topPerformers/bottomPerformers 应为数组
    for (const field of ['topPerformers', 'bottomPerformers']) {
      if (field in output && !Array.isArray(output[field])) {
        fieldResults.push({
          field,
          level: 'error',
          message: `${field} 应为数组类型`,
          repaired: false,
        });
        errors.push(`${field} 应为数组类型`);
      }
    }
  }

  /**
   * 从 outputSchema 提取字段属性
   */
  private extractSchemaProperties(
    schema: Record<string, unknown>,
  ): Record<string, Record<string, unknown>> {
    const properties = schema.properties;
    if (properties && typeof properties === 'object') {
      return properties as Record<string, Record<string, unknown>>;
    }
    return {};
  }

  /**
   * 获取字段默认值
   */
  private getDefaultValue(fieldSchema: Record<string, unknown>): unknown {
    const type = (fieldSchema.type as string) ?? 'string';
    return this.DEFAULT_VALUES[type] ?? '';
  }

  /**
   * 根据字段名猜测默认值
   */
  private guessDefaultByFieldName(field: string): unknown {
    if (field === 'summary') return '（分析摘要缺失）';
    if (field === 'recommendations') return ['（暂无建议）'];
    if (field === 'riskAlerts') return [];
    if (field === 'trendAnalysis') return '（趋势分析缺失）';
    if (field === 'dailyTrend') return '（日趋势分析缺失）';
    if (field === 'efficiencyOverview') return '（效率概览缺失）';
    return '';
  }

  /**
   * 尝试类型转换
   */
  private tryConvertType(value: unknown, target: string): unknown {
    try {
      switch (target) {
        case 'string':
          return typeof value === 'object' ? JSON.stringify(value) : String(value);
        case 'number':
          const num = Number(value);
          return Number.isFinite(num) ? num : undefined;
        case 'array':
          return Array.isArray(value) ? value : [value];
        case 'object':
          return typeof value === 'string' ? JSON.parse(value) : undefined;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
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
   * 根据错误/警告数量确定总等级
   */
  private determineLevel(errors: string[], warnings: string[]): ValidationLevel {
    if (errors.length > 0) return 'error';
    if (warnings.length > 2) return 'warning';
    return 'pass';
  }
}
