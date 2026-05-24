/** QQ群文件分类器 - Web UI (对接 NapCat OneBot) */

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP = express();
APP.use(express.json());
const PORT = 3002;
const NAPCAT = 'http://127.0.0.1:3000';
const OUTPUT = path.resolve(__dirname, 'QQ群文件分类');
const RULES_FILE = path.resolve(__dirname, 'auto_rules.json');

var DEFAULT_RULES = [
  { keyword: '作业', folder: '作业', enabled: true },
  { keyword: '报告', folder: '报告', enabled: true },
  { keyword: '总结', folder: '总结', enabled: true },
  { keyword: '论文', folder: '论文', enabled: true },
  { keyword: '汇报', folder: '汇报', enabled: true },
  { keyword: '述职', folder: '述职', enabled: true },
  { keyword: '合同', folder: '合同', enabled: true },
  { keyword: '协议', folder: '合同', enabled: true },
  { keyword: '发票', folder: '发票', enabled: true },
  { keyword: '简历', folder: '简历', enabled: true },
  { keyword: '照片', folder: '照片', enabled: true },
  { keyword: '截图', folder: '截图', enabled: true },
  { keyword: '课件', folder: '课件', enabled: true },
  { keyword: '教程', folder: '教程', enabled: true },
  { keyword: '安装', folder: '安装包', enabled: true },
  { keyword: '视频', folder: '视频', enabled: true },
  { keyword: '录音', folder: '音频', enabled: true },
  { keyword: '音乐', folder: '音频', enabled: true },
  { keyword: '模板', folder: '模板', enabled: true },
  { keyword: '设计', folder: '设计素材', enabled: true },
  { keyword: '源码', folder: '代码', enabled: true },
  { keyword: '数据', folder: '数据报表', enabled: true },
  { keyword: '统计', folder: '数据报表', enabled: true },
];

function loadData() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      var raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
      // 兼容旧格式（纯数组 → 新格式）
      if (Array.isArray(raw)) return { rules: raw, whitelist: ['重要','合同','协议','模板','安装包'] };
      return raw;
    }
  } catch(e) {
    // 没有 auto_rules.json 时尝试读取默认模板
    var defPath = path.resolve(__dirname, 'auto_rules.default.json');
    try { if (fs.existsSync(defPath)) return JSON.parse(fs.readFileSync(defPath, 'utf8')); } catch(ex) {}
  }
  return { rules: DEFAULT_RULES, whitelist: ['重要','合同','协议','模板','安装包'] };
}
function saveData(d) { fs.writeFileSync(RULES_FILE, JSON.stringify(d, null, 2)); }

function loadRules() { return loadData().rules || []; }
function saveRules(r) { var d = loadData(); d.rules = r; saveData(d); }

function loadWhitelist() { return loadData().whitelist || []; }
function saveWhitelist(w) { var d = loadData(); d.whitelist = w; saveData(d); }

// ============================================================
// OneBot API（带请求队列，防止并发导致 NapCat 状态串扰）
// ============================================================
var _apiQueue = Promise.resolve();
function api(action, params = {}) {
  const url = new URL('/' + action, NAPCAT);
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], String(kv[1])); });
  // 所有请求排队串行执行，避免并发时 NapCat 返回错误群的数据
  var task = _apiQueue.then(function() {
    return new Promise(function(resolve, reject) {
      var r = http.get(url.toString(), function(res) {
        var d = '';
        res.on('data', function(c) { d += c; });
        res.on('end', function() {
          try { var j = JSON.parse(d); j.status === 'ok' ? resolve(j.data) : reject(j.msg || 'fail'); }
          catch (e) { reject(d.slice(0, 200)); }
        });
      });
      r.on('error', reject);
      r.setTimeout(15000, function() { this.destroy(); reject('timeout'); });
    });
  });
  // 失败不阻塞后续请求
  _apiQueue = task.catch(function() {});
  return task;
}

// ============================================================
// 分类引擎
// ============================================================
var CATS = [
  { n: '文档', exts: ['.doc','.docx','.pdf','.txt','.md'] },
  { n: '图片', exts: ['.png','.jpg','.jpeg','.bmp','.gif','.heic'] },
  { n: '压缩包', exts: ['.zip','.rar','.7z','.tar','.gz'] },
  { n: '代码', exts: ['.py','.js','.ts','.java','.cpp','.c','.h','.go','.rs'] },
  { n: '表格', exts: ['.xls','.xlsx','.csv'] },
  { n: '视频', exts: ['.mp4','.avi','.mov','.mkv','.flv'] },
  { n: '音频', exts: ['.mp3','.wav','.flac'] },
  { n: 'PPT', exts: ['.ppt','.pptx'] },
  { n: '安装包', exts: ['.exe','.msi','.apk'] },
  { n: '其他', exts: [] },
];
function cls(name) {
  var ext = path.extname(name).toLowerCase();
  for (var i = 0; i < CATS.length; i++) { if (CATS[i].exts.indexOf(ext) >= 0) return CATS[i].n; }
  return '其他';
}
function sz(b) {
  if (b >= 1073741824) return (b/1073741824).toFixed(1)+'GB';
  if (b >= 1048576) return (b/1048576).toFixed(1)+'MB';
  if (b >= 1024) return (b/1024).toFixed(1)+'KB';
  return b+'B';
}

// ============================================================
// API
// ============================================================

APP.get('/api/info', async function(req, res) {
  try { res.json(await api('get_login_info')); } catch(e) { res.json({}); }
});

APP.get('/api/groups', async function(req, res) {
  try {
    var list = await api('get_group_list');
    var groups = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      var localFiles = 0;
      var dir = path.join(OUTPUT, g.group_name || ('群_' + g.group_id));
      if (fs.existsSync(dir)) {
        var entries = fs.readdirSync(dir);
        for (var j = 0; j < entries.length; j++) {
          var fp = path.join(dir, entries[j]);
          if (fs.statSync(fp).isDirectory()) localFiles += fs.readdirSync(fp).length;
        }
      }
      // 不再对每个群调用 get_group_root_files 递归统计，
      // 避免轮询时大量并发请求导致 NapCat 状态串扰
      groups.push({ id: g.group_id, name: g.group_name, localFiles: localFiles, groupFiles: 0 });
    }
    res.json(groups);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 扫描群文件（展平列表）
APP.post('/api/scan/:gid', async function(req, res) {
  const gid = parseInt(req.params.gid);
  try {
    async function walk(fid) {
      var list = fid ? await api('get_group_files_by_folder', { group_id: gid, folder_id: fid }) : await api('get_group_root_files', { group_id: gid });
      var result = (list.files || []).map(function(f) {
        return { id: f.file_id || f.fid, name: f.file_name || f.name, size: f.file_size || f.size || 0, busid: f.busid || 0, category: cls(f.file_name || f.name) };
      });
      var folders = list.folders || [];
      for (var i = 0; i < folders.length; i++) {
        var sub = await walk(folders[i].folder_id);
        result = result.concat(sub);
      }
      return result;
    }
    var files = await walk(null);
    res.json({ ok: true, total: files.length, files: files });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 扫描群文件（树形结构）
APP.post('/api/scan-tree/:gid', async function(req, res) {
  const gid = parseInt(req.params.gid);
  try {
    async function walk(fid) {
      var list = fid ? await api('get_group_files_by_folder', { group_id: gid, folder_id: fid }) : await api('get_group_root_files', { group_id: gid });
      var files = (list.files || []).map(function(f) {
        return { id: f.file_id || f.fid, name: f.file_name || f.name, size: f.file_size || f.size || 0, busid: f.busid || 0, category: cls(f.file_name || f.name) };
      });
      var folders = [];
      var flist = list.folders || [];
      for (var i = 0; i < flist.length; i++) {
        var folderPath = fid || '/';
      folders.push({ name: flist[i].folder_name || flist[i].name, id: flist[i].folder_id, path: folderPath, children: await walk(flist[i].folder_id) });
      }
      return { files: files, folders: folders };
    }
    var tree = await walk(null);
    res.json({ ok: true, tree: tree });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 移动群文件（支持批量）
APP.post('/api/move', async function(req, res) {
  var body = req.body;
  var files = body.files || [body];
  if (!files.length) return res.status(400).json({ error: 'no files' });
  var ok = 0, fail = 0;
  for (var i = 0; i < files.length; i++) {
    try {
      var f = files[i];
      await api('move_group_file', {
        group_id: String(f.group_id || body.group_id),
        file_id: f.file_id,
        current_parent_directory: f.current_parent_directory || body.current_parent_directory,
        target_parent_directory: f.target_parent_directory || body.target_parent_directory,
      });
      ok++;
    } catch(e) { fail++; }
  }
  res.json({ ok: true, success: ok, fail: fail });
});

// 重命名
APP.post('/api/rename', async function(req, res) {
  var body = req.body;
  try {
    var r = await api('rename_group_file', {
      group_id: String(body.group_id),
      file_id: body.file_id,
      current_parent_directory: body.current_parent_directory,
      new_name: body.new_name || body.name,
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 下载指定文件到分类目录
APP.post('/api/classify', async function(req, res) {
  var body = req.body;
  var gid = body.gid, fileList = body.files, category = body.category;
  if (!gid || !fileList || !fileList.length) return res.status(400).json({ error: 'bad params' });
  try {
    var info = await api('get_group_info', { group_id: gid });
    var groupName = info.group_name || ('群_' + gid);
    var ok = 0, fail = 0;
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      try {
        var urlData = await api('get_group_file_url', { group_id: gid, file_id: f.id, busid: f.busid || 0 });
        var destDir = path.join(OUTPUT, groupName, category || f.category);
        fs.mkdirSync(destDir, { recursive: true });
        await dl(urlData.url || urlData, path.join(destDir, f.name));
        ok++;
      } catch(e) { fail++; }
    }
    res.json({ ok: true, success: ok, fail: fail });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function dl(url, dest) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(dest);
    http.get(url, { timeout: 120000 }, function(r) {
      if (r.statusCode === 302 || r.statusCode === 301) { file.close(); return dl(r.headers.location, dest).then(resolve).catch(reject); }
      if (r.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest); } catch(e) {} return reject(new Error('HTTP ' + r.statusCode)); }
      r.pipe(file);
      file.on('finish', function() { file.close(); resolve(); });
    }).on('error', function(e) { file.close(); try { fs.unlinkSync(dest); } catch(ex) {} reject(e); });
  });
}

// ── 自动分类规则 ──
APP.get('/api/rules', function(req, res) {
  res.json({ rules: loadRules(), whitelist: loadWhitelist() });
});

APP.post('/api/rules', function(req, res) {
  if (req.body.rules) saveRules(req.body.rules);
  if (req.body.whitelist) saveWhitelist(req.body.whitelist);
  res.json({ ok: true });
});

// ── 自动清理（删除超过 N 天的文件） ──
APP.post('/api/auto-clean/:gid', async function(req, res) {
  const gid = parseInt(req.params.gid);
  var days = req.body && req.body.days ? parseInt(req.body.days) : 30;
  var maxAge = days * 24 * 60 * 60 * 1000; // 毫秒
  var now = Date.now();
  try {
    async function walk(fid) {
      var list = fid ? await api('get_group_files_by_folder', { group_id: gid, folder_id: fid }) : await api('get_group_root_files', { group_id: gid });
      var result = (list.files || []).map(function(f) {
        var modTime = (f.modify_time || f.upload_time || 0) * 1000;
        return { id: f.file_id || f.fid, name: f.file_name || f.name, modTime: modTime, age: now - modTime };
      });
      var folders = list.folders || [];
      for (var i = 0; i < folders.length; i++) {
        result = result.concat(await walk(folders[i].folder_id));
      }
      return result;
    }
    var files = await walk(null);
    var whitelist = loadWhitelist() || [];
    var deleted = 0, skipped = 0, protected = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.modTime <= 0 || f.age < maxAge) { skipped++; continue; }
      // 检查白名单
      var isProtected = false;
      for (var w = 0; w < whitelist.length; w++) {
        if (f.name.indexOf(whitelist[w]) >= 0) { isProtected = true; break; }
      }
      if (isProtected) { protected++; continue; }
      try {
        await api('delete_group_file', { group_id: String(gid), file_id: f.id });
        deleted++;
      } catch(e) { skipped++; }
    }
    res.json({ ok: true, total: files.length, deleted: deleted, skipped: skipped, protected: protected, ageDays: days });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 自动移动（按关键词移文件到对应文件夹，使用文件夹UUID） ──
APP.post('/api/auto-move/:gid', async function(req, res) {
  const gid = parseInt(req.params.gid);
  try {
    var rules = loadRules().filter(function(r) { return r.enabled; });
    if (!rules.length) return res.json({ ok: true, total: 0, moved: 0, message: '没有启用的规则' });

    // 第一步：扫描根目录，获取所有文件夹名称→UUID映射
    var rootData = await api('get_group_root_files', { group_id: gid });
    var folderMap = {};  // 名称 → UUID
    (rootData.folders || []).forEach(function(f) {
      folderMap[f.folder_name] = f.folder_id;
    });

    // 第二步：扫描所有文件（递归所有子文件夹）
    async function walk(fid) {
      var list = fid ? await api('get_group_files_by_folder', { group_id: gid, folder_id: fid }) : await api('get_group_root_files', { group_id: gid });
      var result = (list.files || []).map(function(f) { return { id: f.file_id || f.fid, name: f.file_name || f.name, size: f.file_size || f.size || 0, folder: fid || '/' }; });
      var folders = list.folders || [];
      for (var i = 0; i < folders.length; i++) {
        result = result.concat(await walk(folders[i].folder_id));
      }
      return result;
    }
    var files = await walk(null);
    if (!files.length) return res.json({ ok: true, total: 0, moved: 0 });

    var sampleNames = files.slice(0, 5).map(function(f) { return f.name; });

    // 第三步：匹配规则 + 移动
    var moved = 0, skipped = 0, notFound = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var matchedFolder = null;
      var fname = f.name.toLowerCase();

      // 关键词匹配
      for (var j = 0; j < rules.length; j++) {
        if (fname.indexOf(rules[j].keyword.toLowerCase()) >= 0) {
          matchedFolder = rules[j].folder;
          break;
        }
      }
      if (!matchedFolder) { skipped++; continue; }

      // 查找目标文件夹UUID，不存在则自动创建
      var targetId = folderMap[matchedFolder];
      if (!targetId) {
        try {
          await api('create_group_file_folder', { group_id: gid, folder_name: matchedFolder, parent_folder_id: '/' });
          // 重新扫描根目录获取新文件夹的UUID
          var freshRoot = await api('get_group_root_files', { group_id: gid });
          (freshRoot.folders || []).forEach(function(f) { folderMap[f.folder_name] = f.folder_id; });
          targetId = folderMap[matchedFolder];
        } catch(e) {}
        if (!targetId) { notFound++; continue; }
      }

      // 用UUID移动文件
      try {
        await api('move_group_file', {
          group_id: String(gid),
          file_id: f.id,
          current_parent_directory: f.folder,
          target_parent_directory: targetId,
        });
        moved++;
      } catch(e) { skipped++; }
    }

    res.json({ ok: true, total: files.length, moved: moved, skipped: skipped, notFound: notFound, samples: sampleNames });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 已分类文件目录
APP.get('/api/files', function(req, res) {
  var data = { groups: {} };
  if (!fs.existsSync(OUTPUT)) return res.json(data);
  var groups = fs.readdirSync(OUTPUT);
  for (var gi = 0; gi < groups.length; gi++) {
    var gp = path.join(OUTPUT, groups[gi]);
    if (!fs.statSync(gp).isDirectory()) continue;
    var cats = {};
    var entries = fs.readdirSync(gp);
    for (var ci = 0; ci < entries.length; ci++) {
      var cp = path.join(gp, entries[ci]);
      if (!fs.statSync(cp).isDirectory()) continue;
      var files = fs.readdirSync(cp).map(function(f) {
        var s = fs.statSync(path.join(cp, f));
        return { name: f, size: sz(s.size), mtime: s.mtime.toLocaleDateString() };
      });
      cats[entries[ci]] = files;
    }
    data.groups[groups[gi]] = cats;
  }
  res.json(data);
});

// ============================================================
// 前端
// ============================================================
APP.use(express.static(path.resolve(__dirname, 'public')));

APP.listen(PORT, function() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   QQ群文件分类器 - Web UI               ║');
  console.log('║                                          ║');
  console.log('║   http://localhost:' + PORT + '                  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
