/**
 * QQ 群文件分类机器人 - Web 管理界面
 * 
 * 在浏览器中操作机器人，无需命令行交互
 * 访问: http://localhost:3000
 */

import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { createClient, Platform, GfsFileStat } from 'icqq';

// ============================================================
// 配置
// ============================================================

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, '../data/icqq');
const OUTPUT_DIR = path.resolve(__dirname, '../../QQ群文件分类');

// ============================================================
// 状态管理
// ============================================================

interface BotState {
  client: ReturnType<typeof createClient> | null;
  loggedIn: boolean;
  qrcodePath: string;
  status: 'idle' | 'qr' | 'slider' | 'sms' | 'online' | 'error';
  errorMsg: string;
  groups: { gid: number; name: string; files: number }[];
  scanLog: string[];
  pendingResolve: ((value: any) => void) | null;
}

const state: BotState = {
  client: null,
  loggedIn: false,
  qrcodePath: '',
  status: 'idle',
  errorMsg: '',
  groups: [],
  scanLog: [],
  pendingResolve: null,
};

// ============================================================
// Express 应用
// ============================================================

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

// ── API: 获取状态 ──

app.get('/api/status', (req, res) => {
  res.json({
    status: state.status,
    loggedIn: state.loggedIn,
    errorMsg: state.errorMsg,
    groups: state.groups,
    scanLog: state.scanLog.slice(-50),
    qrcodeExists: fs.existsSync(state.qrcodePath),
  });
});

// ── API: 登录 ──

app.post('/api/login', (req, res) => {
  const { uin, password } = req.body;
  if (!uin) return res.status(400).json({ error: '请输入 QQ 号' });

  startBot(parseInt(uin), password || '');
  res.json({ ok: true, message: '登录中...' });
});

// ── API: 提交滑块验证 ──

app.post('/api/slider', async (req, res) => {
  const { ticket } = req.body;
  if (!ticket || !state.client) return res.status(400).json({ error: '无效的 ticket' });
  try {
    await state.client.submitSlider(ticket);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: 提交短信验证码 ──

app.post('/api/sms', async (req, res) => {
  const { code } = req.body;
  if (!code || !state.client) return res.status(400).json({ error: '无效的验证码' });
  try {
    await state.client.submitSmsCode(code);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: 获取二维码 ──

app.get('/api/qrcode', (req, res) => {
  const qrPath = state.qrcodePath;
  if (!fs.existsSync(qrPath)) return res.status(404).json({ error: '二维码未生成' });
  res.sendFile(qrPath);
});

// ── API: 扫描群文件 ──

app.post('/api/scan/:gid', async (req, res) => {
  const gid = parseInt(req.params.gid);
  if (!state.client || !state.loggedIn) return res.status(400).json({ error: '未登录' });
  
  const group = state.client.pickGroup(gid);
  addLog(`开始扫描群 ${gid}...`);
  
  try {
    const entries = await group.fs.dir('/');
    const files = entries.filter((e: any): e is GfsFileStat => !e.is_dir);
    const folders = entries.filter((e: any) => e.is_dir);

    const allFiles: GfsFileStat[] = [...files];
    for (const folder of folders) {
      try {
        const sub = await group.fs.dir(folder.fid as string);
        allFiles.push(...sub.filter((e: any): e is GfsFileStat => !e.is_dir));
      } catch {}
    }

    res.json({ ok: true, total: allFiles.length, files: allFiles.map(f => f.name) });
    addLog(`群 ${gid} 扫描完成，共 ${allFiles.length} 个文件`);

    // 后台下载（不阻塞响应）
    downloadFiles(group, allFiles, gid);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    addLog(`❌ 扫描失败: ${err.message}`);
  }
});

// ── API: 获取分类文件目录 ──

app.get('/api/files', (req, res) => {
  const groups: Record<string, any> = {};
  if (!fs.existsSync(OUTPUT_DIR)) return res.json({ groups: {} });
  
  const groupDirs = fs.readdirSync(OUTPUT_DIR);
  for (const groupDir of groupDirs) {
    const groupPath = path.join(OUTPUT_DIR, groupDir);
    if (!fs.statSync(groupPath).isDirectory()) continue;
    
    const catDirs = fs.readdirSync(groupPath);
    const categories: Record<string, string[]> = {};
    
    for (const catDir of catDirs) {
      const catPath = path.join(groupPath, catDir);
      if (!fs.statSync(catPath).isDirectory()) continue;
      categories[catDir] = fs.readdirSync(catPath);
    }
    
    groups[groupDir] = categories;
  }
  
  res.json({ groups });
});

// ============================================================
// 机器人核心
// ============================================================

function addLog(msg: string): void {
  const time = new Date().toLocaleTimeString();
  state.scanLog.push(`[${time}] ${msg}`);
  if (state.scanLog.length > 200) state.scanLog.splice(0, 50);
  console.log(msg);
}

function startBot(uin: number, password: string = ''): void {
  state.status = 'qr';
  state.errorMsg = '';
  state.qrcodePath = path.resolve(__dirname, '../login_qrcode.png');
  state.scanLog = [];

  const client = createClient({
    platform: Platform.Android,
    data_dir: DATA_DIR,
    sign_api_addr: 'https://sign.napneko.icu',
  });

  state.client = client;

  client.on('system.login.qrcode', (event: any) => {
    fs.writeFileSync(state.qrcodePath, event.image);
    state.status = 'qr';
    addLog('📱 二维码已生成，请用手机 QQ 扫描');
  });

  client.on('system.login.slider', () => {
    state.status = 'slider';
    addLog('🔐 需要滑动验证');
  });

  client.on('system.login.device', () => {
    state.status = 'sms';
    addLog('📱 已发送短信验证码到手机');
    client.sendSmsCode();
  });

  client.on('system.login.error', ({ code, message }: any) => {
    state.status = 'error';
    state.errorMsg = `[${code}] ${message}`;
    addLog(`❌ 登录失败: ${message}`);
  });

  client.on('system.online', async () => {
    state.loggedIn = true;
    state.status = 'online';
    addLog(`✅ 登录成功! QQ: ${client.uin}`);

    // 更新群列表
    state.groups = [];
    for (const [gid, info] of client.gl.entries()) {
      state.groups.push({ gid, name: info.group_name || `群_${gid}`, files: 0 });
    }
    addLog(`📋 共 ${state.groups.length} 个群聊`);

    // 首次扫描
    addLog('🔄 开始首次扫描...');
    for (const [gid, _info] of client.gl.entries()) {
      try {
        const group = client.pickGroup(gid);
        const entries = await group.fs.dir('/');
        const files = entries.filter((e: any) => !e.is_dir);
        const gs = state.groups.find(g => g.gid === gid);
        if (gs) gs.files = files.length;
      } catch {}
    }
    addLog(`✅ 首次扫描完成，每 60 秒自动检查新文件`);
  });

  // 监听群消息
  client.on('message.group', async (event) => {
    const msg = (event.raw_message || '').trim();
    if (!msg.startsWith('/')) return;
    const cmd = msg.slice(1).split(/\s+/)[0].toLowerCase();
    const gid = event.group_id;

    if (cmd === 'scan' || cmd === '整理') {
      const group = client.pickGroup(gid);
      await event.reply('🔍 开始扫描群文件...');
      try {
        const entries = await group.fs.dir('/');
        const files = entries.filter((e: any): e is GfsFileStat => !e.is_dir);
        const folders = entries.filter((e: any) => e.is_dir);
        const allFiles: GfsFileStat[] = [...files];
        for (const folder of folders) {
          try {
            const sub = await group.fs.dir(folder.fid as string);
            allFiles.push(...sub.filter((e: any): e is GfsFileStat => !e.is_dir));
          } catch {}
        }
        await event.reply(`📊 本群共 ${allFiles.length} 个文件，开始下载...`);
        addLog(`📋 群 ${gid} 手动扫描，${allFiles.length} 个文件`);
        downloadFiles(group, allFiles, gid);
      } catch (err: any) {
        await event.reply(`❌ 扫描失败: ${err.message}`);
      }
    }
  });

  if (password) {
    client.login(uin, password);
    addLog(`🔑 密码登录 ${uin}...`);
  } else {
    client.login(uin);
    addLog(`🔑 扫码登录 ${uin}...`);
  }
}

async function downloadFiles(group: any, files: GfsFileStat[], gid: number): Promise<void> {
  if (!state.client) return;
  const entries = Array.from(state.client.gl.entries());
  const entry = entries.find(([id]) => id === gid);
  const groupName = entry?.[1]?.group_name || `群_${gid}`;
  const outDir = path.join(OUTPUT_DIR, sanitize(groupName));

  let ok = 0, skip = 0;
  for (const file of files) {
    if (file.size > 500 * 1024 * 1024) { skip++; continue; }
    try {
      const dl = await group.fs.download(file.fid);
      const { classifyAndDownload } = require('./classifier');
      const result = await classifyAndDownload(dl.name, dl.url, outDir);
      if (result.success) {
        ok++;
        addLog(`   ✅ ${dl.name} → ${result.category}`);
      }
    } catch { skip++; }
  }
  addLog(`📁 群 ${groupName}: 下载 ${ok}, 跳过 ${skip}`);
  
  // 更新文件计数
  const gs = state.groups.find(g => g.gid === gid);
  if (gs) gs.files = files.length;
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名';
}

// ============================================================
// 启动
// ============================================================

app.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║   QQ 群文件分类 - Web 管理界面          ║`);
  console.log(`║                                          ║`);
  console.log(`║   🌐 http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log('');
  console.log('在浏览器中打开上面的地址即可操作机器人');
});
