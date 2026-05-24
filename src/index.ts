#!/usr/bin/env node

/**
 * QQ群文件自动分类工具 - CLI 入口
 *
 * P0 功能:
 *   1. 扫描指定目录所有文件
 *   2. SHA256 去重
 *   3. 按后缀 + 关键词规则自动分类
 *   4. 复制/移动到分类目录
 *   5. 显示分类统计
 */

import * as path from 'path';
import { scanDirectory } from './scanner/folder';
import { Classifier } from './classifier';
import { organizeFiles, ClassifiedItem } from './organizer/mover';
import { dedupFiles, DedupFile } from './organizer/dedup';

function printUsage(): void {
  console.log(`
╔══════════════════════════════════════════╗
║      QQ群文件自动分类器  v0.1.0         ║
╚══════════════════════════════════════════╝

用法:
  qq-filer <源目录> [输出目录] [选项]

选项:
  --move          移动文件（默认是复制，源文件保留）
  --no-dedup      不进行 SHA256 去重
  --dry-run       预览模式，只看结果不动文件

示例:
  qq-filer D:\\QQFiles D:\\分类结果
  qq-filer .\\QQ群文件 --move --dry-run
  qq-filer .\\QQ群文件 --no-dedup

提示: 源目录可以是 QQ 接收文件的目录，如:
  C:\\Users\\<用户名>\\Documents\\QQNT\\FileRecv\\
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const sourceDir = path.resolve(args[0]);
  const outputDir = args[1] && !args[1].startsWith('--')
    ? path.resolve(args[1])
    : path.resolve(sourceDir, '..', 'QQ群文件分类');
  const isMove = args.includes('--move');
  const noDedup = args.includes('--no-dedup');
  const dryRun = args.includes('--dry-run');

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      QQ群文件自动分类器  v0.1.0         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // ── 1. 扫描 ──
  console.log(`📂 扫描目录: ${sourceDir}`);
  const allFiles = scanDirectory(sourceDir, ['node_modules', '.git']);
  console.log(`   共发现 ${allFiles.length} 个文件`);
  console.log('');

  if (allFiles.length === 0) {
    console.log('❌ 目录为空或不存在，请检查路径');
    return;
  }

  // ── 2. 去重 ──
  let processFiles: DedupFile[] = allFiles;
  if (!noDedup) {
    console.log('🔍 正在去重 ...');
    const { kept, removed } = dedupFiles(allFiles);
    processFiles = kept;
    console.log(`   ✕ 移除 ${removed.length} 个重复文件`);
    console.log(`   ✓ 保留 ${kept.length} 个文件`);
    console.log('');
  }

  // ── 3. 分类 ──
  console.log('🏷️  正在分类 ...');
  const classifier = new Classifier();

  const classified: ClassifiedItem[] = processFiles.map(f => {
    const result = classifier.classify(f.fileName);
    return {
      fileName: f.fileName,
      filePath: f.filePath,
      category: result.category,
      subCategory: result.subCategory,
    };
  });

  // 分类统计
  const stats = new Map<string, number>();
  for (const c of classified) {
    const key = c.subCategory ? `${c.category}/${c.subCategory}` : c.category;
    stats.set(key, (stats.get(key) || 0) + 1);
  }

  const maxCount = Math.max(...stats.values(), 1);
  console.log('');
  console.log('📊 分类预览:');
  for (const [cat, count] of [...stats.entries()].sort((a, b) => b[1] - a[1])) {
    const barLen = Math.ceil((count / maxCount) * 20);
    const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
    console.log(`   ${bar}  ${cat.padEnd(16)} ${String(count).padStart(3)} 个`);
  }
  console.log('');

  // ── 4. 整理 ──
  if (dryRun) {
    console.log('🔍 预览模式 (--dry-run) — 未执行任何文件操作');
    console.log(`   目标目录: ${outputDir}`);
    console.log(`   操作模式: ${isMove ? '移动' : '复制'}`);
  } else {
    console.log(`📁 正在${isMove ? '移动' : '复制'}文件到:`);
    console.log(`   ${outputDir}`);
    console.log('');

    const result = organizeFiles(classified, outputDir, !isMove);

    console.log('✅ 完成! 分类结果:');
    for (const r of result) {
      const label = r.subCategory
        ? `${r.category}/${r.subCategory}`
        : r.category;
      console.log(`   ✓ ${label.padEnd(16)} ${r.count} 个文件`);
    }
    console.log('');
    console.log(`📁 输出目录: ${outputDir}`);
  }

  // 统计未知文件
  const unknownCount = classified.filter(c => c.category === '未知').length;
  if (unknownCount > 0) {
    console.log('');
    console.log(`💡 提示: ${unknownCount} 个文件未能分类（归入"未知"）`);
    console.log(`   可以在 config/categories.yaml 中添加规则来覆盖更多文件类型`);
  }
}

main();
