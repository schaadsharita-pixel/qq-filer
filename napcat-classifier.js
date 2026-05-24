/**
 * NapCat 群文件分类器
 * 
 * 对接 NapCat (OneBot v11 协议)，自动下载并分类群文件
 * 
 * 使用:
 *   1. 先启动 NapCat (Shell 模式或框架模式)
 *   2. 编辑下方 NAPCAT 配置（端口）
 *   3. node napcat-classifier.js
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ════════════════════════════════════════════════════════════════
// 配置（改成你的 NapCat 端口）
// ════════════════════════════════════════════════════════════════

const NAPCAT = {
  /** NapCat HTTP API 端口 */
  http: 'http://127.0.0.1:3000',

  /** NapCat WebSocket 端口 */
  ws: 'ws://127.0.0.1:3001',

  /** 反向 WebSocket 端口（NapCat 连我们） */
  reverseWs: 2530,
};

const CONFIG = {
  /** 输出目录 */
  outputDir: path.resolve(__dirname, 'QQ群文件分类'),

  /** 单文件上限 */
  maxFileSize: 500 * 1024 * 1024,

  /** 扫描间隔（秒） */
  scanInterval: 60,
};

// ════════════════════════════════════════════════════════════════
// 分类引擎（内嵌）
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
// OneBot API 客户端
// ════════════════════════════════════════════════════════════════

function callApi(action, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/${action}`, NAPCAT.http);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    http.get(url.toString(), (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          j.status === 'ok' ? resolve(j.data) : reject(new Error(JSON.stringify(j)));
        } catch { reject(new Error(data.slice(0, 200))); }
      });
    }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('超时')); });
  });
}

// ════════════════════════════════════════════════════════════════
// 下载文件
// ════════════════════════════════════════════════════════════════

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

function fmtSize(b) {
  if (b >= 1<<30) return (b/(1<<30)).toFixed(1)+'GB';
  if (b >= 1<<20) return (b/(1<<20)).toFixed(1)+'MB';
  if (b >= 1<<10) return (b/(1<<10)).toFixed(1)+'KB';
  return b+'B';
}

function sanitize(s) { return s.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名'; }

// ════════════════════════════════════════════════════════════════
// 处理群文件
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

  let url;
  try {
    url = await callApi('get_group_file_url', {
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
    await download(url.url || url, dest);
    log(`✅ ${file.name} 已保存`);
  } catch (e) {
    log(`❌ ${file.name}: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════
// 日志
// ════════════════════════════════════════════════════════════════

function log(msg) {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}] ${msg}`);
}

// ════════════════════════════════════════════════════════════════
// WebSocket 连接
// ════════════════════════════════════════════════════════════════

var _retryTimer = null;

function connect() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  log(`🔄 正在连接 NapCat WebSocket: ${NAPCAT.ws}...`);

  const ws = new WebSocket(NAPCAT.ws);

  ws.on('open', () => {
    log(`✅ 已连接到 NapCat!`);
    log(`📁 输出目录: ${CONFIG.outputDir}`);
    log('');
    log('💡 在群里发送以下命令:');
    log('   /help — 显示帮助');
    log('   /scan — 扫描本群所有文件');
    log('   /status — 查看状态');
    log('');
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const { post_type, notice_type, message_type, group_id, file, raw_message, sender, self_id } = msg;

      // ── 群文件上传事件 ──
      if (post_type === 'notice' && notice_type === 'group_upload' && file) {
        log(`📤 群 ${group_id}: ${file.name} (${fmtSize(file.size)})`);
        let name = `群_${group_id}`;
        try {
          const info = await callApi('get_group_info', { group_id });
          name = info.group_name;
        } catch {}
        await handleFile(file, group_id, name);
      }

      // ── 群消息（命令） ──
      if (post_type === 'message' && message_type === 'group') {
        const cmd = (raw_message || '').trim();
        if (!cmd.startsWith('/')) return;

        switch (cmd.slice(1).split(/\s+/)[0].toLowerCase()) {
          case 'help':
          case '帮助':
            sendMsg(group_id, [
              '🤖 QQ群文件分类器 (NapCat)',
              '',
              '命令:',
              '  /scan 或 /整理 — 扫描本群所有文件并分类',
              '  /status 或 /状态 — 查看状态',
              '  /help 或 /帮助 — 显示此帮助',
              '',
              '群文件上传后自动下载并按类型归类',
            ].join('\n'));
            break;

          case 'scan':
          case '整理':
            sendMsg(group_id, '🔍 开始扫描群文件...');
            scanGroup(group_id);
            break;

          case 'status':
          case '状态':
            let name = `群_${group_id}`;
            try {
              const info = await callApi('get_group_info', { group_id });
              name = info.group_name;
            } catch {}
            const outDir = path.join(CONFIG.outputDir, sanitize(name));
            let count = 0;
            if (fs.existsSync(outDir)) {
              count = countFiles(outDir);
            }
            sendMsg(group_id, `📊 ${name}: 已分类 ${count} 个文件\n📁 ${CONFIG.outputDir}`);
            break;
        }
      }
    } catch (e) {
      log(`❌ 处理事件出错: ${e.message}`);
    }
  });

  ws.on('close', () => {
    if (!_retryTimer) {
      log('⚠️  连接断开，10 秒后重连...');
      _retryTimer = setTimeout(() => { _retryTimer = null; connect(); }, 10000);
    }
  });

  ws.on('error', (e) => {
    if (!_retryTimer) {
      log(`❌ WebSocket 错误: ${e.message}`);
      log('⏳ 10 秒后重试...');
      _retryTimer = setTimeout(() => { _retryTimer = null; connect(); }, 10000);
    }
  });
}

// ════════════════════════════════════════════════════════════════
// 发消息 / 扫描
// ════════════════════════════════════════════════════════════════

async function sendMsg(groupId, msg) {
  try {
    await callApi('send_group_msg', { group_id: groupId, message: msg });
  } catch {}
}

async function scanGroup(groupId) {
  try {
    const root = await callApi('get_group_root_files', { group_id: groupId });
    const allFiles = [...(root.files || [])];

    if (root.folders) {
      for (const f of root.folders) {
        try {
          const sub = await callApi('get_group_files_by_folder', {
            group_id: groupId, folder_id: f.folder_id,
          });
          allFiles.push(...(sub.files || []));
        } catch {}
      }
    }

    if (allFiles.length === 0) {
      sendMsg(groupId, '📭 本群暂无文件');
      return;
    }

    sendMsg(groupId, `📊 共 ${allFiles.length} 个文件，正在下载分类...`);

    let ok = 0, fail = 0;
    for (const file of allFiles) {
      try {
        if (file.size > CONFIG.maxFileSize) { fail++; continue; }
        await handleFile(file, groupId);
        ok++;
      } catch { fail++; }
    }

    sendMsg(groupId, `✅ 完成: 成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`);
  } catch (e) {
    sendMsg(groupId, `❌ 扫描失败: ${e.message}`);
  }
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
// 启动
// ════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   QQ群文件分类器 - NapCat 版            ║');
console.log('║   OneBot v11 协议                        ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
console.log(`  NapCat HTTP: ${NAPCAT.http}`);
console.log(`  NapCat WS:   ${NAPCAT.ws}`);
console.log(`  输出目录:     ${CONFIG.outputDir}`);
console.log('');

// 第一次连接延迟一下（等 NapCat 就绪）
setTimeout(connect, 1000);
