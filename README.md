# QQ群文件分类器

基于 NapCat OneBot 协议的 QQ 群文件管理工具，支持：

- 📂 **文件浏览** — 查看群文件树，展开/折叠文件夹
- 🎯 **智能分类** — 按关键词自动匹配文件夹，不存在的文件夹自动创建
- 📦 **批量移动** — 多选文件批量移动到指定文件夹
- 🗑️ **自动清理** — 删除超过30天的旧文件（白名单保护）
- 🎨 **iOS风格界面** — 简洁现代的 Web 操作面板

---

## 环境要求

| 软件 | 版本 | 说明 |
|------|------|------|
| **Node.js** | ≥ 16 | 运行服务端 |
| **NapCat QQ** | ≥ 4.18 | QQ 机器人框架，提供 OneBot API |

---

## 快速部署

### 1️⃣ 安装 Node.js

从 https://nodejs.org 下载安装 Node.js ≥ 16 版本。

### 2️⃣ 安装 NapCat QQ

NapCat 提供一键安装包（NapCat.Shell.Windows.OneKey），安装后 NapCat 的 QQ 会启动。
首次使用需要在 NapCat WebUI 中扫码登录 QQ。

### 3️⃣ 下载本项目

```bash
git clone https://github.com/schaadsharita-pixel/qq-filer.git
cd qq-filer
```

或者直接下载 ZIP 解压。

### 4️⃣ 安装依赖

```bash
npm install
```

### 5️⃣ 一键启动

**双击 `start-all.bat`** 或运行：

```bash
start-all.bat
```

会自动启动三个服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| Web UI | 3002 | 浏览器打开 http://localhost:3002 |
| 分类器 | 后台 | 监听群文件变动自动分类 |
| NapCat QQ | — | QQ 客户端（需已登录） |

### 6️⃣ 扫码登录

如果 NapCat QQ 还未登录，浏览器打开：
```
http://127.0.0.1:6099/webui?token=529a5e89e669
```
用手机 QQ 扫码登录。

---

## 功能说明

### 群列表
- 显示所有 QQ 群的名称和文件数量
- `智能` — 按关键词自动分类文件到对应文件夹
- `清理` — 删除超过30天的文件（白名单保护）
- `浏览` — 查看群内文件树

### 规则设置
在「规则」标签页配置：

**自动分类规则：**
| 关键词 | → | 目标文件夹 |
|--------|---|-----------|
| `作业` | → | 作业 |
| `合同` | → | 合同 |

**清理白名单：**
文件名包含指定关键词的文件不会被自动清理

### 文件浏览
- 点击「浏览」查看群文件树
- 有文件的文件夹自动展开
- 点击「编辑」进入多选模式，底部工具栏批量移动

---

## 端口说明

| 端口 | 用途 |
|------|------|
| 3000 | NapCat OneBot HTTP API |
| 3001 | NapCat WebSocket |
| 3002 | QQ群文件分类器 Web UI |
| 6099 | NapCat WebUI 管理面板 |

---

## 文件结构

```
qq-filer/
├── start-all.bat           # 一键启动（推荐）
├── napcat-webui.js         # Web UI 服务端
├── napcat-classifier.js    # 后台分类器
├── package.json            # 项目配置 + 依赖
├── public/
│   └── index.html          # Web 前端页面
├── auto_rules.default.json # 默认分类规则
├── auto_rules.json         # 运行时规则 + 白名单
└── QQ群文件分类/           # 本地下载目录（不提交）
```

---

## 注意

- 本工具需要 **NapCat QQ** 已登录并在后台运行
- 首次使用需要在 NapCat WebUI 中扫码登录 QQ
- `QQ群文件分类/` 目录存放下载的文件，不上传至 Git
