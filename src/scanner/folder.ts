/**
 * 文件夹扫描器
 * 递归遍历目录，收集所有文件信息
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ScannedFile {
  fileName: string;
  filePath: string;
  size: number;
  modifiedTime: Date;
}

/**
 * 递归扫描目录，返回所有文件列表
 * @param dirPath 目录路径
 * @param excludes 排除的目录名（可选）
 */
export function scanDirectory(
  dirPath: string,
  excludes: string[] = []
): ScannedFile[] {
  const files: ScannedFile[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 权限不足等，跳过
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 跳过隐藏目录和排除列表
        if (!entry.name.startsWith('.') && !excludes.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          files.push({
            fileName: entry.name,
            filePath: fullPath,
            size: stat.size,
            modifiedTime: stat.mtime,
          });
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  }

  walk(dirPath);
  return files;
}
