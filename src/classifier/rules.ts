/**
 * 规则匹配引擎
 * 对文件名同时运行后缀 + 关键词匹配，返回最佳分类
 */

import { Category, SubCategory, Rule, DEFAULT_CATEGORIES } from './categories';
import * as path from 'path';

export interface MatchResult {
  category: string;
  subCategory?: string;
  confidence: number;
}

export class RuleMatcher {
  private categories: Category[];

  constructor(categories?: Category[]) {
    this.categories = categories || DEFAULT_CATEGORIES;
  }

  /**
   * 对文件名运行所有规则，返回置信度最高的匹配
   */
  match(fileName: string): MatchResult {
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName);

    let best: MatchResult = { category: '未知', confidence: 0 };

    for (const cat of this.categories) {
      // 匹配主类别规则
      if (cat.rules) {
        const result = this.evaluateRules(cat, undefined, cat.rules, ext, baseName);
        if (result.confidence > best.confidence) best = result;
      }

      // 匹配子类别规则
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          const result = this.evaluateRules(cat, sub, sub.rules, ext, baseName);
          if (result.confidence > best.confidence) best = result;
        }
      }
    }

    return best;
  }

  /**
   * 评估一组规则对单个文件的匹配分数
   *
   * 评分策略:
   *   - 后缀匹配: 基础分 0.6 (说明知道是什么类型)
   *   - 后缀 + 关键词: 满分 1.0 (精准匹配)
   */
  private evaluateRules(
    cat: Category,
    sub: SubCategory | undefined,
    rules: Rule[],
    ext: string,
    baseName: string
  ): MatchResult {
    let bestScore = 0;

    for (const rule of rules) {
      // 后缀不匹配 → 跳过这条规则
      if (rule.exts && !rule.exts.includes(ext)) {
        continue;
      }

      // 有后缀且匹配 → 基础 0.6
      let score = rule.exts ? 0.6 : 0;

      // 关键词匹配 → 额外 0.4
      if (rule.keywords) {
        const hasKeyword = rule.keywords.some(kw =>
          baseName.toLowerCase().includes(kw.toLowerCase())
        );
        if (hasKeyword) score += 0.4;
      }

      // 同分时覆盖（保留更后面的匹配——子类别排后面优先）
      if (score >= bestScore) bestScore = score;
    }

    if (bestScore > 0) {
      return {
        category: cat.name,
        subCategory: sub?.name,
        confidence: Math.min(bestScore, 1.0),
      };
    }

    return { category: '未知', confidence: 0 };
  }
}
