/**
 * QQ 群文件分类机器人 - 主入口
 * 
 * 纯 Node.js QQ 协议实现（基于 icqq v0.6.10）
 * 无需任何外部二进制文件，npm install 即可用
 * 
 * 使用:
 *   1. 编辑下方 CONFIG 中的 QQ 号
 *   2. npm run bot
 *   3. 首次扫码登录
 */

import { createClient, Platform, GfsFileStat } from 'icqq';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { classifyAndDownload } from './classifier';

// ============================================================
// 配置（改成你的 QQ 号）
// ============================================================

const CONFIG = {
  uin: 0,              // ← 改成你的 QQ 号，或填了直接自动登录

  platform: Platform.Android,  // Android | iPad | Windows | QQClient

  dataDir: path.resolve(__dirname, '../data/icqq'),

  outputDir: path.resolve(__dirname, '../../QQ群文件分类'),

  /** 扫描间隔（秒） */
  scanInterval: 60,

  /** 单文件大小上限 */
  maxFileSize: 500 * 1024 * 1024,
};

// ============================================================
// 输入工具
// ============================================================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

// ============================================================
// 客户端
// ============================================================

const client = createClient({
  platform: CONFIG.platform,
  data_dir: CONFIG.dataDir,
  sign_api_addr: 'https://sign.napneko.icu',
});

// ============================================================
// 登录事件
// ============================================================

client.on('system.login.qrcode', async (event: any) => {
  console.log('\n📱 请扫描二维码登录:');
  // event.image 是 Buffer
  const qrPath = path.resolve(__dirname, '../login_qrcode.png');
  fs.writeFileSync(qrPath, event.image);
  console.log(`   二维码已保存: ${qrPath}`);
  console.log('   或用手机 QQ 扫描后按回车');
});

client.on('system.login.slider', async () => {
  console.log('\n🔐 需要滑动验证');
  console.log('   打开链接完成验证后，复制 ticket 粘贴到这里');
  const ticket = await ask('   ticket: ');
  await client.submitSlider(ticket);
});

client.on('system.login.device', async () => {
  console.log('\n📱 设备锁验证，已向手机发送验证码');
  const code = await ask('   验证码: ');
  await client.sendSmsCode();
  await client.submitSmsCode(code);
  console.log('   ✅ 验证完成');
});

client.on('system.login.error', ({ code, message }: any) => {
  console.error(`\n❌ 登录失败 [${code}]: ${message}`);
  process.exit(1);
});

// ============================================================
// 群文件状态跟踪
// ============================================================

interface GroupFileState {
  groupId: number;
  groupName: string;
  knownFiles: Set<string>; // fid 集合
}

const groupStates = new Map<number, GroupFileState>();

// ============================================================
// 上线事件
// ============================================================

client.on('system.online', async () => {
  console.log(`\n✅ 登录成功! QQ: ${client.uin}`);
  console.log(`📁 输出目录: ${CONFIG.outputDir}`);
  console.log('');

  const groupList = Array.from(client.gl.entries());
  console.log(`📋 共 ${groupList.length} 个群聊:`);

  for (const [gid, info] of groupList) {
    const name = info.group_name || `群_${gid}`;
    console.log(`   📌 ${name} (${gid})`);
    groupStates.set(gid, { groupId: gid, groupName: name, knownFiles: new Set() });
  }

  console.log('\n🔄 开始首次扫描...');
  await scanAllGroups();
  console.log(`\n✅ 首次扫描完成，每 ${CONFIG.scanInterval}s 自动检查新文件`);
  console.log('   在群里发送 /help 查看命令列表');
  console.log('');

  setInterval(scanAllGroups, CONFIG.scanInterval * 1000);
});

// ============================================================
// 群消息 → 命令响应
// ============================================================

client.on('message.group', async (event) => {
  const msg = (event.raw_message || '').trim();
  if (!msg.startsWith('/')) return;

  const [cmd, ..._args] = msg.slice(1).split(/\s+/);
  const gid = event.group_id;

  switch (cmd.toLowerCase()) {
    case 'scan':
    case '整理':
      await cmdScanGroup(gid, event);
      break;

    case 'help':
    case '帮助':
      await event.reply([
        '🤖 QQ群文件分类机器人\n',
        '命令:',
        '  /scan (或 /整理) — 扫描并下载本群所有文件',
        '  /status (或 /状态) — 查看本群文件统计',
        '  /help — 显示此帮助',
        '',
        '新文件上传后，60 秒内自动下载并分类到本地目录',
      ].join('\n'));
      break;

    case 'status':
    case '状态':
      await cmdStatus(event);
      break;
  }
});

// ============================================================
// 群文件扫描
// ============================================================

async function scanAllGroups(): Promise<void> {
  for (const [gid, state] of groupStates) {
    try {
      await scanGroupNewFiles(gid, state);
    } catch {
      // 单个群失败不影响其他群
    }
  }
}

async function scanGroupNewFiles(gid: number, state: GroupFileState): Promise<void> {
  const group = client.pickGroup(gid);

  // dir() 返回 (GfsFileStat | GfsDirStat)[] 混合数组
  const entries = await group.fs.dir('/');

  // 分离文件和目录
  const files = entries.filter((e): e is GfsFileStat => !e.is_dir);
  const folders = entries.filter(e => e.is_dir);

  // 收集所有文件
  const allFiles: GfsFileStat[] = [...files];

  // 递归读取子目录
  for (const folder of folders) {
    try {
      const sub = await group.fs.dir(folder.fid);
      const subFiles = sub.filter((e): e is GfsFileStat => !e.is_dir);
      allFiles.push(...subFiles);
    } catch {
      // 跳过无法访问的目录
    }
  }

  // 筛选新文件
  const newFiles = allFiles.filter(f => !state.knownFiles.has(f.fid));

  if (newFiles.length === 0) return;

  // 更新已知文件集合
  for (const f of allFiles) state.knownFiles.add(f.fid);

  console.log(`\n📂 [${state.groupName}] 发现 ${newFiles.length} 个新文件`);

  // 逐个下载并分类
  for (const file of newFiles) {
    if (file.size > CONFIG.maxFileSize) {
      console.log(`   ⚠️  跳过超大文件: ${file.name} (${fmtSize(file.size)})`);
      continue;
    }

    try {
      const info = await group.fs.download(file.fid);
      const outDir = path.join(CONFIG.outputDir, sanitize(state.groupName));
      const result = await classifyAndDownload(info.name, info.url, outDir);
      if (result.success) {
        console.log(`   ✅ ${file.name} → ${result.category}`);
      } else {
        console.log(`   ❌ ${file.name}: ${result.error}`);
      }
    } catch (err: any) {
      console.log(`   ❌ ${file.name}: ${err.message}`);
    }
  }
}

// ============================================================
// 命令 /scan
// ============================================================

async function cmdScanGroup(gid: number, event: any): Promise<void> {
  const group = client.pickGroup(gid);
  const state = groupStates.get(gid);
  if (!state) return;

  console.log(`\n📋 [${state.groupName}] 手动扫描所有文件...`);
  await event.reply('🔍 开始扫描群文件，可能需要几分钟...');

  try {
    const entries = await group.fs.dir('/');
    const files = entries.filter((e): e is GfsFileStat => !e.is_dir);
    const folders = entries.filter(e => e.is_dir);

    const allFiles: GfsFileStat[] = [...files];
    for (const folder of folders) {
      try {
        const sub = await group.fs.dir(folder.fid);
        allFiles.push(...sub.filter((e): e is GfsFileStat => !e.is_dir));
      } catch {}
    }

    if (allFiles.length === 0) {
      await event.reply('📭 本群暂无文件');
      return;
    }

    // 统计
    const extMap = new Map<string, number>();
    for (const f of allFiles) {
      const ext = path.extname(f.name).toLowerCase() || '(无后缀)';
      extMap.set(ext, (extMap.get(ext) || 0) + 1);
    }

    const statLines = [`📊 ${state.groupName} 共 ${allFiles.length} 个文件：`];
    for (const [ext, cnt] of [...extMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      statLines.push(`  ${ext}: ${cnt}个`);
    }
    await event.reply(statLines.join('\n'));

    // 下载（不超过 50MB）
    const outDir = path.join(CONFIG.outputDir, sanitize(state.groupName));
    let ok = 0, skip = 0;

    for (const file of allFiles) {
      if (file.size > 50 * 1024 * 1024) { skip++; continue; }
      try {
        const info = await group.fs.download(file.fid);
        await classifyAndDownload(info.name, info.url, outDir);
        ok++;
        console.log(`   ✅ ${file.name}`);
      } catch { skip++; }
      state.knownFiles.add(file.fid);
    }

    await group.sendMsg(
      `✅ 下载完成: ${ok} 个文件已按类型分类\n📁 保存到: ${outDir}`
    );
    console.log(`\n📁 [${state.groupName}] 下载 ${ok}, 跳过 ${skip}`);

  } catch (err: any) {
    console.error(`❌ 扫描失败:`, err.message);
    await event.reply(`❌ 扫描失败: ${err.message}`);
  }
}

// ============================================================
// 命令 /status
// ============================================================

async function cmdStatus(event: any): Promise<void> {
  const group = client.pickGroup(event.group_id);
  try {
    const info = await group.fs.df();
    const state = groupStates.get(event.group_id);

    await event.reply([
      `📊 ${event.group_name || '本群'} 文件状态:`,
      `  文件数: ${info.file_count}`,
      `  已扫描: ${state?.knownFiles.size || 0}`,
      `  空间: ${fmtSize(info.used)} / ${fmtSize(info.total)}`,
    ].join('\n'));
  } catch {
    await event.reply('❌ 获取文件状态失败');
  }
}

// ============================================================
// 启动
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   QQ 群文件自动分类机器人  v0.2.0       ║');
  console.log('║   纯 Node.js，无需外部依赖               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  let uin = CONFIG.uin;
  if (!uin) {
    const input = await ask('请输入 QQ 号: ');
    uin = parseInt(input);
    if (isNaN(uin)) { console.error('❌ 无效的 QQ 号'); process.exit(1); }
  }

  const pwd = await ask('请输入密码（直接回车则扫码登录）: ');

  if (pwd) {
    console.log(`\n🔑 密码登录 ${uin}...`);
    client.login(uin, pwd);
  } else {
    console.log(`\n🔑 扫码登录 ${uin}...`);
    console.log(`   数据目录: ${CONFIG.dataDir}`);
    client.login(uin);
  }
}

main().catch(err => { console.error('❌ 启动失败:', err); process.exit(1); });

// ============================================================
// 工具函数
// ============================================================

function fmtSize(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)}GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)}MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)}KB`;
  return `${bytes}B`;
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名';
}
