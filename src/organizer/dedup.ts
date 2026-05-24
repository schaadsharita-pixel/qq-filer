/**
 * 文件去重模块
 * 基于 SHA256 哈希，检测内容完全相同的文件
 */

import { createHash } from 'crypto';
import * as fs from 'fs';

/**
 * 计算单个文件的 SHA256 哈希
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export interface DedupFile {
  fileName: string;
  filePath: string;
}

/**
 * 对文件列表去重，保留第一份，后续重复的被移除
 * @returns {kept: 保留的文件, removed: 被移除的重复文件}
 */
export function dedupFiles(
  files: DedupFile[]
): { kept: DedupFile[]; removed: DedupFile[] } {
  const seen = new Set<string>();
  const kept: DedupFile[] = [];
  const removed: DedupFile[] = [];

  // 按文件大小预过滤，减少哈希计算
  const sizeMap = new Map<number, DedupFile[]>();
  for (const f of files) {
    const size = fs.statSync(f.filePath).size;
    const group = sizeMap.get(size) || [];
    group.push(f);
    sizeMap.set(size, group);
  }

  for (const [, group] of sizeMap) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }

    // 同大小才需要哈希
    for (const f of group) {
      const h = hashFile(f.filePath);
      if (seen.has(h)) {
        removed.push(f);
      } else {
        seen.add(h);
        kept.push(f);
      }
    }
  }

  return { kept, removed };
}
