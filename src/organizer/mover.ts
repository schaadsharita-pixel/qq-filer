/**
 * 文件整理器
 * 按分类结果将文件复制/移动到目标目录
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ClassifiedItem {
  fileName: string;
  filePath: string;
  category: string;
  subCategory?: string;
}

export interface OrganizeStat {
  category: string;
  subCategory?: string;
  count: number;
}

/**
 * 将已分类的文件整理到目标目录
 * @param files 文件列表（含路径）
 * @param outputDir 输出根目录
 * @param copyMode true=复制, false=移动
 * @returns 整理统计
 */
export function organizeFiles(
  files: ClassifiedItem[],
  outputDir: string,
  copyMode: boolean = true
): OrganizeStat[] {
  const stats = new Map<string, OrganizeStat>();

  for (const item of files) {
    // 目标路径: outputDir / category / [subCategory] / fileName
    const targetDir = item.subCategory
      ? path.join(outputDir, `${item.category}-${item.subCategory}`)
      : path.join(outputDir, item.category);

    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, item.fileName);

    // 处理同名文件冲突
    const finalPath = resolveNameConflict(targetPath);

    try {
      if (copyMode) {
        fs.copyFileSync(item.filePath, finalPath);
      } else {
        fs.renameSync(item.filePath, finalPath);
      }
    } catch (err) {
      console.error(`  ⚠️  跳过 ${item.fileName}: ${(err as Error).message}`);
      continue;
    }

    // 统计
    const key = item.subCategory
      ? `${item.category}/${item.subCategory}`
      : item.category;
    const existing = stats.get(key) || { category: item.category, subCategory: item.subCategory, count: 0 };
    existing.count++;
    stats.set(key, existing);
  }

  return Array.from(stats.values());
}

/**
 * 同名文件冲突解决
 * 已存在则追加 _1, _2 后缀
 */
function resolveNameConflict(targetPath: string): string {
  if (!fs.existsSync(targetPath)) return targetPath;

  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let counter = 1;

  while (true) {
    const newPath = path.join(dir, `${base}_${counter}${ext}`);
    if (!fs.existsSync(newPath)) return newPath;
    counter++;
  }
}
