/**
 * 分类器主模块
 * 组合规则匹配引擎，对外暴露 classify 接口
 */

import { Category, DEFAULT_CATEGORIES } from './categories';
import { RuleMatcher, MatchResult } from './rules';

export class Classifier {
  private matcher: RuleMatcher;

  constructor(categories?: Category[]) {
    this.matcher = new RuleMatcher(categories || DEFAULT_CATEGORIES);
  }

  /**
   * 对单个文件名进行分类
   */
  classify(fileName: string): MatchResult {
    return this.matcher.match(fileName);
  }
}
