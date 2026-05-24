/**
 * QQ群文件分类器 — NapCat 插件版 (CommonJS)
 *
 * 自动下载群文件并按类型归类到本地文件夹
 * 支持 /scan /status /help 群命令
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// 配置
// ════════════════════════════════════════════════════════════════

const CONFIG = {
  outputDir: '',
  maxFileSize: 500 * 1024 * 1024,
};

// ════════════════════════════════════════════════════════════════
// 分类规则
// ════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { name: '📄 文档-作业报告', exts: ['.doc','.docx','.pdf','.txt','.md'], keywords: ['作业','报告','总结','论文','汇报','述职'] },
  { name: '📄 文档-商务文档', exts: ['.pdf','.doc','.docx'], keywords: ['合同','协议','发票','报价','标书','章程'] },
  { name: '📄 文档-简历', exts: ['.pdf','.doc','.docx'], keywords: ['简历','履历','CV'] },
  { name: '📄 文档-电子书', exts: ['.pdf','.epub','.mobi','.azw3'], keywords: ['书','手册','指南','教程','教材'] },
  { name: '🖼️ 图片-截图', exts: ['.png','.jpg','.jpeg','.bmp','.gif'], keywords: ['截图','截屏','screen','捕获'] },
  { name: '🖼️ 图片-照片', exts: ['.jpg','.jpeg','.png','.gif','.heic'], keywords: ['合照','照片','photo','自拍'] },
  { name: '🖼️ 图片-设计素材', exts: ['.psd','.ai','.sketch','.fig'], keywords: ['设计','UI','原型','海报'] },
  { name: '📦 压缩包', exts: ['.zip','.rar','.7z','.tar','.gz','.bz2'], keywords: [] },
  { name: '💻 代码', exts: ['.py','.js','.ts','.java','.cpp','.c','.h','.go','.rs'], keywords: ['源码','代码'] },
  { name: '📊 表格', exts: ['.xls','.xlsx','.csv','.et'], keywords: ['统计','数据','报表','台账'] },
  { name: '🎬 视频', exts: ['.mp4','.avi','.mov','.wmv','.flv','.mkv'], keywords: ['视频','录像','电影'] },
  { name: '🎵 音频', exts: ['.mp3','.wav','.flac','.aac','.ogg'], keywords: ['音频','录音','音乐'] },
  { name: '📽️ PPT', exts: ['.ppt','.pptx'], keywords: ['演示','幻灯片','课件'] },
  { name: '⚙️ 安装包', exts: ['.exe','.msi','.dmg','.apk','.appimage'], keywords: ['安装','setup'] },
  { name: '📋 其他', exts: [], keywords: [] },
];

function classifyFile(filename) {
  const name = filename.toLowerCase();
  const ext = path.extname(name);
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (name.includes(kw.toLowerCase())) return cat.name;
    }
  }
  for (const cat of CATEGORIES) {
    if (cat.exts.includes(ext)) return cat.name;
  }
  return '📋 其他';
}

// ════════════════════════════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════════════════════════════

function fmtSize(b) {
  if (b >= 1<<30) return (b/(1<<30)).toFixed(1)+'GB';
  if (b >= 1<<20) return (b/(1<<20)).toFixed(1)+'MB';
  if (b >= 1<<10) return (b/(1<<10)).toFixed(1)+'KB';
  return b+'B';
}

function sanitize(s) { return s.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名'; }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); try { fs.unlinkSync(dest); } catch {}
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (e) => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
    req.on('timeout', () => { req.destroy(); file.close(); try { fs.unlinkSync(dest); } catch {} reject(new Error('超时')); });
  });
}

function countFiles(dir) {
  let c = 0;
  try {
    for (const e of fs.readdirSync(dir)) {
      const f = path.join(dir, e);
      c += fs.statSync(f).isDirectory() ? countFiles(f) : 1;
    }
  } catch {}
  return c;
}

// ════════════════════════════════════════════════════════════════
// 文件处理
// ════════════════════════════════════════════════════════════════

const processed = new Set();

async function handleFile(file, groupId, groupName) {
  const key = `${groupId}_${file.id}`;
  if (processed.has(key)) return;
  processed.add(key);

  if (file.size > CONFIG.maxFileSize) {
    log(`⚠️  跳过超大: ${file.name} (${fmtSize(file.size)})`);
    return;
  }

  let urlData;
  try {
    urlData = await ctx.actions.call('get_group_file_url', {
      group_id: groupId,
      file_id: file.id,
      busid: file.busid || 0,
    });
  } catch (e) {
    log(`❌ ${file.name}: 获取链接失败 - ${e.message}`);
    return;
  }

  const cat = classifyFile(file.name);
  const dest = path.join(CONFIG.outputDir, sanitize(groupName || `群_${groupId}`), sanitize(cat), file.name);

  try {
    log(`📥 ${file.name} → ${cat}`);
    await download(urlData.url || urlData, dest);
    log(`✅ ${file.name} 已保存`);
  } catch (e) {
    log(`❌ ${file.name}: ${e.message}`);
  }
}

async function scanGroup(groupId) {
  try {
    const root = await ctx.actions.call('get_group_root_files', { group_id: groupId });
    const allFiles = [...(root.files || [])];

    if (root.folders) {
      for (const f of root.folders) {
        try {
          const sub = await ctx.actions.call('get_group_files_by_folder', {
            group_id: groupId, folder_id: f.folder_id,
          });
          allFiles.push(...(sub.files || []));
        } catch {}
      }
    }

    if (allFiles.length === 0) {
      await ctx.actions.call('send_group_msg', { group_id: groupId, message: '📭 本群暂无文件' });
      return;
    }

    await ctx.actions.call('send_group_msg', { group_id: groupId, message: `📊 共 ${allFiles.length} 个文件，正在下载分类...` });

    let ok = 0, fail = 0;
    for (const file of allFiles) {
      try {
        if (file.size > CONFIG.maxFileSize) { fail++; continue; }
        let name;
        try { const info = await ctx.actions.call('get_group_info', { group_id: groupId }); name = info.group_name; } catch { name = `群_${groupId}`; }
        await handleFile(file, groupId, name);
        ok++;
      } catch { fail++; }
    }

    await ctx.actions.call('send_group_msg', { group_id: groupId, message: `✅ 完成: 成功 ${ok} 个${fail ? '，失败 ' + fail + ' 个' : ''}` });
  } catch (e) {
    await ctx.actions.call('send_group_msg', { group_id: groupId, message: `❌ 扫描失败: ${e.message}` });
  }
}

// ════════════════════════════════════════════════════════════════
// 日志
// ════════════════════════════════════════════════════════════════

let logger = null;

function log(msg) {
  if (logger) logger.info(msg);
  else { const t = new Date().toLocaleTimeString(); console.log(`[${t}] ${msg}`); }
}

// ════════════════════════════════════════════════════════════════
// 插件上下文
// ════════════════════════════════════════════════════════════════

let ctx = null;

// ════════════════════════════════════════════════════════════════
// 插件导出
// ════════════════════════════════════════════════════════════════

async function plugin_init(pluginCtx) {
  ctx = pluginCtx;
  logger = ctx.logger;

  CONFIG.outputDir = path.resolve(__dirname, '..', '..', '..', 'QQ群文件分类');

  logger.info('');
  logger.info('╔══════════════════════════════════════════╗');
  logger.info('║   QQ群文件分类器 (NapCat 插件)          ║');
  logger.info('╚══════════════════════════════════════════╝');
  logger.info('');
  logger.info(`📁 输出目录: ${CONFIG.outputDir}`);
  logger.info('');
  logger.info('💡 在群里发送以下命令:');
  logger.info('   /help  — 显示帮助');
  logger.info('   /scan  — 扫描本群所有文件');
  logger.info('   /status — 查看状态');
  logger.info('');

  try {
    const loginInfo = await ctx.actions.call('get_login_info');
    logger.info(`✅ 已登录账号: ${loginInfo.nickname} (${loginInfo.user_id})`);
  } catch {}
}

async function plugin_onmessage(pluginCtx, event) {
  if (event.message_type !== 'group') return;

  const raw = event.raw_message || '';
  if (!raw.startsWith('/')) return;

  const groupId = event.group_id;
  const cmd = raw.slice(1).split(/\s+/)[0].toLowerCase();

  try {
    switch (cmd) {
      case 'help':
      case '帮助':
        await ctx.actions.call('send_group_msg', {
          group_id: groupId,
          message: [
            '🤖 QQ群文件分类器 (NapCat插件)',
            '',
            '命令:',
            '  /scan 或 /整理 — 扫描本群所有文件并分类',
            '  /status 或 /状态 — 查看状态',
            '  /help 或 /帮助 — 显示此帮助',
            '',
            '群文件上传后自动下载并按类型归类',
          ].join('\n'),
        });
        break;

      case 'scan':
      case '整理':
        await ctx.actions.call('send_group_msg', { group_id: groupId, message: '🔍 开始扫描群文件...' });
        scanGroup(groupId);
        break;

      case 'status':
      case '状态': {
        let name = `群_${groupId}`;
        try { const info = await ctx.actions.call('get_group_info', { group_id: groupId }); name = info.group_name; } catch {}
        const outDir = path.join(CONFIG.outputDir, sanitize(name));
        let count = 0;
        if (fs.existsSync(outDir)) count = countFiles(outDir);
        await ctx.actions.call('send_group_msg', {
          group_id: groupId,
          message: `📊 ${name}: 已分类 ${count} 个文件\n📁 ${CONFIG.outputDir}`,
        });
        break;
      }
    }
  } catch (e) {
    logger.error(`处理命令出错: ${e.message}`);
  }
}

async function plugin_onevent(pluginCtx, event) {
  if (event.post_type === 'notice' && event.notice_type === 'group_upload' && event.file) {
    const { group_id, file } = event;
    logger.info(`📤 群 ${group_id}: ${file.name} (${fmtSize(file.size)})`);

    let name = `群_${group_id}`;
    try { const info = await ctx.actions.call('get_group_info', { group_id }); name = info.group_name; } catch {}

    await handleFile(file, group_id, name);
  }
}

module.exports = { plugin_init, plugin_onmessage, plugin_onevent };
