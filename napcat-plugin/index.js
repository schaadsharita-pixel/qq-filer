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
  // 只看文件名是否包含关键词，不看后缀
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (name.includes(kw.toLowerCase())) return cat.name;
    }
  }
  return '📋 其他';
}

// 判断文件夹名是否本身就是分类名（用于匹配已有分类文件夹）
function isCategoryName(name) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].name === name) return true;
  }
  return false;
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

    // 按类型统计
    var catCount = {};
    for (var file of allFiles) {
      var cat = classifyFile(file.file_name || file.name || '');
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
    var summary = Object.keys(catCount).map(function(c) { return c + ': ' + catCount[c] + '个'; }).join('\n');
    await ctx.actions.call('send_group_msg', { group_id: groupId, message: `📊 共 ${allFiles.length} 个文件\n\n📋 分类统计:\n${summary}\n\n💡 发送 /整理 自动归类到群文件夹` });
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

  // 规则文件路径（存在插件的配置目录，不会随代码更新丢失）
  var RULES_FILE = path.join(path.dirname(ctx.configPath), 'auto_rules.json');

  // 配置 UI 在 module 顶层已定义（静态），此处仅加载已保存的配置
  try {
    if (fs.existsSync(ctx.configPath)) {
      const saved = JSON.parse(fs.readFileSync(ctx.configPath, 'utf-8'));
      if (saved.outputDir) CONFIG.outputDir = saved.outputDir;
      if (saved.maxFileSize) CONFIG.maxFileSize = saved.maxFileSize;
    }
  } catch {}

  // 注册扩展页面
  ctx.router.page({
    path: 'dashboard',
    title: '群文件管理',
    icon: '📁',
    htmlFile: 'webui/index.html',
    description: '浏览和分类群文件',
  });
  ctx.router.static('/webui', 'webui');

  // ════════════════════════════════════
  // API 路由
  // ════════════════════════════════════

  // API: 基本信息
  ctx.router.getNoAuth('/info', async (req, res) => {
    try {
      var info = await ctx.actions.call('get_login_info', {});
      res.json({ user_id: info.user_id, nickname: info.nickname });
    } catch(e) { res.json({}); }
  });

  // API: 群列表
  ctx.router.getNoAuth('/groups', async (req, res) => {
    try {
      var raw = await ctx.actions.call('get_group_list', {});
      var list = Array.isArray(raw) ? raw : (raw && raw.data ? raw.data : []);
      var groups = [];
      for (var i = 0; i < list.length; i++) {
        var g = list[i];
        var localFiles = 0;
        var dir = path.join(CONFIG.outputDir, sanitize(g.group_name || '群_'+g.group_id));
        if (fs.existsSync(dir)) {
          var entries = fs.readdirSync(dir);
          for (var j = 0; j < entries.length; j++) {
            var fp = path.join(dir, entries[j]);
            if (fs.statSync(fp).isDirectory()) localFiles += fs.readdirSync(fp).length;
          }
        }
        groups.push({ id: g.group_id, name: g.group_name, localFiles: localFiles, groupFiles: 0 });
      }
      res.json(groups);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // API: 扫描群文件（树形）
  ctx.router.postNoAuth('/scan-tree/:gid', async (req, res) => {
    var gid = parseInt(req.params.gid);
    try {
      async function walk(fid) {
        var list = fid ? await ctx.actions.call('get_group_files_by_folder', { group_id: gid, folder_id: fid }) : await ctx.actions.call('get_group_root_files', { group_id: gid });
        var files = (list.files || []).map(function(f) { return { id: f.file_id || f.fid, name: f.file_name || f.name, size: f.file_size || f.size || 0, busid: f.busid || 0, category: classifyFile(f.file_name || f.name) }; });
        var folders = [];
        for (var i = 0; i < (list.folders || []).length; i++) { folders.push({ name: list.folders[i].folder_name, id: list.folders[i].folder_id, children: await walk(list.folders[i].folder_id) }); }
        return { files: files, folders: folders };
      }
      res.json({ ok: true, tree: await walk(null) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // API: 下载文件到本地
  ctx.router.postNoAuth('/move', async (req, res) => {
    try {
      var body = req.body || {};
      var files = body.files || [body];
      var ok = 0, fail = 0;
      for (var i = 0; i < files.length; i++) {
        try {
          var f = files[i];
          var url = await ctx.actions.call('get_group_file_url', { group_id: f.group_id, file_id: f.id, busid: f.busid || 0 });
          var cat = classifyFile(f.name);
          var dest = path.join(CONFIG.outputDir, sanitize(f.group_name || '群_'+f.group_id), sanitize(cat), f.name);
          if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
          await download(url.url || url, dest); ok++;
        } catch(e) { fail++; }
      }
      res.json({ ok: true, moved: ok, failed: fail });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // API: 规则
  ctx.router.getNoAuth('/rules', async (req, res) => {
    try {
      if (fs.existsSync(RULES_FILE)) return res.json(JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')));
    } catch {}
    res.json({ rules: [], whitelist: ['重要','合同','协议','模板','安装包'] });
  });

  ctx.router.postNoAuth('/rules', async (req, res) => {
    try {
      var dir = path.dirname(RULES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(RULES_FILE, JSON.stringify(req.body, null, 2));
      res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // API: 本地文件
  ctx.router.getNoAuth('/files', async (req, res) => {
    try {
      var result = [];
      if (fs.existsSync(CONFIG.outputDir)) {
        for (var g of fs.readdirSync(CONFIG.outputDir)) {
          var gd = path.join(CONFIG.outputDir, g);
          if (!fs.statSync(gd).isDirectory()) continue;
          for (var c of fs.readdirSync(gd)) {
            var cd = path.join(gd, c);
            if (!fs.statSync(cd).isDirectory()) continue;
            for (var e of fs.readdirSync(cd)) { result.push({ name: e, group: g, category: c }); }
          }
        }
      }
      res.json(result);
    } catch(e) { res.json([]); }
  });

  // API: 智能整理（在线分类，在QQ群里创建文件夹并移动文件）
  ctx.router.postNoAuth('/auto-move/:gid', async (req, res) => {
    var logFile = path.join(ctx.pluginPath, 'classify_debug.log');
    function dlog(msg) {
      var line = new Date().toLocaleTimeString() + ' ' + msg;
      try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch {}
      if (logger) logger.info(msg);
    }
    try {
      var gid = parseInt(req.params.gid);
      dlog('=== 开始智能分类 群 ' + gid + ' ===');

      // 加载自定义规则
      var customRules = [];
      try { if (fs.existsSync(RULES_FILE)) { var rd = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')); customRules = rd.rules || []; } } catch {}
      dlog('自定义规则: ' + customRules.length + ' 条');

      // 自定义分类（先查规则，再查内置关键词）
      function smartClassify(name) {
        var lower = name.toLowerCase();
        // 先查自定义规则
        for (var i = 0; i < customRules.length; i++) {
          var r = customRules[i];
          if (r.enabled !== false && r.keyword && lower.includes(r.keyword.toLowerCase())) {
            dlog('  规则匹配: ' + name + ' → ' + r.keyword + ' → ' + r.folder);
            return r.folder;
          }
        }
        // 再查内置关键词
        var builtin = classifyFile(name);
        return builtin;
      }

      // 收集所有文件（全部文件夹都遍历，已分类的也要重新分）
      var allFiles = [];
      var catFolderIds = {};

      async function walk(folderId, currentPath) {
        var list = await ctx.actions.call('get_group_files_by_folder', { group_id: gid, folder_id: folderId });
        for (var f of (list.files || [])) {
          allFiles.push({ file: f, path: currentPath });
        }
        for (var f of (list.folders || [])) {
          // 记录已有分类文件夹（用做目标）
          if (!catFolderIds[f.folder_name] && (isCategoryName(f.folder_name) || customRules.some(function(r) { return r.folder === f.folder_name; }))) {
            catFolderIds[f.folder_name] = f.folder_id;
          }
          // 继续遍历子文件夹，收集里面的文件重新分类
          await walk(f.folder_id, f.folder_id);
        }
      }

      // 获取根目录
      dlog('获取根目录...');
      var root = await ctx.actions.call('get_group_root_files', { group_id: gid });
      dlog('根目录: ' + (root.files||[]).length + ' 个文件, ' + (root.folders||[]).length + ' 个文件夹');
      // 先记录已有分类文件夹
      for (var f of (root.folders || [])) {
        if (isCategoryName(f.folder_name) || customRules.some(function(r) { return r.folder === f.folder_name; })) {
          catFolderIds[f.folder_name] = f.folder_id;
          dlog('根目录分类文件夹: ' + f.folder_name + ' → ' + f.folder_id);
        } else {
          dlog('根目录非分类文件夹(将遍历): ' + f.folder_name);
        }
      }
      // 收集根目录文件 + 遍历所有文件夹
      for (var f of (root.files || [])) {
        allFiles.push({ file: f, path: '/' });
      }
      for (var f of (root.folders || [])) {
        await walk(f.folder_id, f.folder_id);
      }
      dlog('共收集 ' + allFiles.length + ' 个文件（含已分类文件夹内的）');

      var ok = 0, fail = 0;
      for (var item of allFiles) {
        try {
          var file = item.file;
          var name = file.file_name || file.name || '';
          var cid = file.file_id || file.fid || '(无ID)';
          var cat = smartClassify(name);
          dlog('  文件: ' + name + ' (id=' + cid + ', 路径=' + item.path + ') → 分类: ' + cat);
          if (cat === '其他') { ok++; continue; }

          // 创建分类文件夹（如果不存在）
          if (!catFolderIds[cat]) {
            dlog('  创建文件夹: ' + cat);
            try {
              var created = await ctx.actions.call('create_group_file_folder', { group_id: gid, folder_name: cat });
              var folderId = (typeof created === 'string') ? created : (created.id || created.folder_id);
              // 有些返回格式嵌套在 result 或 groupItem 里
              if (!folderId && created && created.groupItem && created.groupItem.folderInfo) {
                folderId = created.groupItem.folderInfo.folderId;
              }
              if (!folderId && created && created.data) {
                folderId = typeof created.data === 'string' ? created.data : (created.data.id || created.data.folder_id);
              }
              if (!folderId) { dlog('  无法获取文件夹ID，可能无权限: ' + JSON.stringify(created).slice(0,100)); fail++; continue; }
              catFolderIds[cat] = folderId;
              dlog('  创建成功: ' + cat + ' → ' + catFolderIds[cat]);
            } catch(e) {
              dlog('  创建失败: ' + (e.message || e));
              fail++; continue;
            }
          }

          // 确保目标目录有 / 前缀
          var targetDir = catFolderIds[cat];
          if (targetDir && !targetDir.startsWith('/')) targetDir = '/' + targetDir;
          dlog('  移动: ' + name + ' → ' + targetDir);

          // 移动文件到分类文件夹
          await ctx.actions.call('move_group_file', {
            group_id: String(gid),
            file_id: cid,
            current_parent_directory: item.path || '/',
            target_parent_directory: targetDir,
          });
          dlog('  移动成功: ' + name);
          ok++;
        } catch(e) {
          dlog('  移动失败: ' + (e.message || e));
          fail++;
        }
      }
      dlog('=== 完成: 共 ' + allFiles.length + ' 个, 移动 ' + ok + ', 失败 ' + fail + ' ===');
      res.json({ ok: true, total: allFiles.length, moved: ok, failed: fail });
    } catch(e) {
      dlog('❌ 整体错误: ' + (e.message || e));
      res.status(500).json({ error: e.message });
    }
  });

  // API: 日志
  ctx.router.getNoAuth('/log', async (req, res) => {
    try {
      var lf = path.resolve(ctx.pluginPath, '..', '..', 'qqfiler.log');
      if (fs.existsSync(lf)) return res.send(fs.readFileSync(lf, 'utf8'));
      res.send('');
    } catch(e) { res.send(''); }
  });
  // 自动打开 WebUI（延迟等 WebUI 就绪）
  try {
    var cp = require('child_process');
    var webuiUrl = 'http://127.0.0.1:' + (process.env.NAPCAT_WEBUI_PORT || '6099') + '/webui';
    setTimeout(function() { cp.exec('start "" "' + webuiUrl + '"', function() {}); }, 3000);
    logger.info('🌐 3秒后自动打开 WebUI: ' + webuiUrl);
  } catch {}

  try {
    const loginInfo = await ctx.actions.call('get_login_info', {});
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

const plugin_get_config = async () => {
  return {
    outputDir: CONFIG.outputDir,
    maxFileSize: CONFIG.maxFileSize / (1024 * 1024),
  };
};

const plugin_set_config = async (newConfig) => {
  if (newConfig.outputDir && newConfig.outputDir !== CONFIG.outputDir) {
    CONFIG.outputDir = newConfig.outputDir;
  }
  if (newConfig.maxFileSize) {
    CONFIG.maxFileSize = newConfig.maxFileSize * (1024 * 1024);
  }
  try {
    fs.writeFileSync(ctx.configPath, JSON.stringify({ outputDir: CONFIG.outputDir, maxFileSize: CONFIG.maxFileSize }, null, 2));
  } catch {}
};

const plugin_config_ui = [
  { type: 'html', html: '<div style="padding:10px;background:rgba(0,0,0,0.03);border-radius:8px"><h3>📁 QQ群文件分类器</h3><p>自动下载群文件并按类型归类到本地文件夹</p></div>' },
  { type: 'text', key: 'outputDir', name: '📂 输出目录', defaultValue: CONFIG.outputDir, description: '文件保存的根目录' },
  { type: 'number', key: 'maxFileSize', name: '📦 单文件上限 (MB)', defaultValue: CONFIG.maxFileSize / (1024*1024), description: '超过此大小的文件跳过' },
];

module.exports = { plugin_init, plugin_onmessage, plugin_onevent, plugin_get_config, plugin_set_config, plugin_config_ui };
