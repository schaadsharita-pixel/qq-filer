/**
 * QQ 文件分类器集成
 * 下载 QQ 群文件并通过已有分类引擎自动归类
 */

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { Classifier } from '../src/classifier';

export interface ClassifyResult {
  success: boolean;
  category: string;
  subCategory?: string;
  path?: string;
  error?: string;
}

const classifier = new Classifier();

/**
 * 下载 QQ 群文件并自动分类保存
 */
export async function classifyAndDownload(
  fileName: string,
  downloadUrl: string,
  outputBaseDir: string,
): Promise<ClassifyResult> {
  const result = classifier.classify(fileName);
  const catDir = result.subCategory
    ? `${result.category}-${result.subCategory}`
    : result.category;

  const destDir = path.join(outputBaseDir, sanitize(catDir));
  const destPath = path.join(destDir, fileName);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    await downloadFile(downloadUrl, destPath);
    return { success: true, category: result.category, subCategory: result.subCategory, path: destPath };
  } catch (err: any) {
    return { success: false, category: result.category, error: err.message };
  }
}

/**
 * HTTP 下载（自动跟随重定向）
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;

    const req = proto.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });

    req.on('error', (e) => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
    req.on('timeout', () => { req.destroy(); file.close(); try { fs.unlinkSync(dest); } catch {} reject(new Error('超时')); });
  });
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').trim() || '未分类';
}
