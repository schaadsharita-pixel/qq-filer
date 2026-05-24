# QQ群文件分类器 - NapCat 安装与使用

## 环境要求
- Node.js 18+
- Windows 系统

## 1. 安装 NapCat

```bash
# 下载源码
git clone --depth 1 https://github.com/NapNeko/NapCatQQ.git
cd NapCatQQ

# 安装依赖（需要好网络，约 5 分钟）
pnpm install --no-frozen-lockfile

# 构建 Shell 模式
pnpm run build:shell
```

或者直接下载编译好的版本：
- **https://github.com/NapNeko/NapCatQQ/releases**
- 选 `NapCat.Shell.Windows.OneKey.zip` → 解压运行 `一键启动.bat`

## 2. 运行 NapCat

```bash
cd NapCatQQ/packages/napcat-shell
node napcat.mjs
```

首次运行会生成配置文件，扫码登录。

## 3. 运行分类器

打开另一个命令行窗口：

```bash
cd C:\Projects\qq-filer
node napcat-classifier.js
```

分类器会自动连上 NapCat，之后群里有人发文件就会自动保存到 `QQ群文件分类/` 目录。

## 4. 在群里使用

| 命令 | 功能 |
|------|------|
| `/scan` 或 `/整理` | 扫描本群所有文件 |
| `/help` 或 `/帮助` | 显示帮助 |
| `/status` 或 `/状态` | 查看状态 |

---

## 项目文件

```
C:\Projects\qq-filer\
├── napcat-classifier.js    ← 🎯 分类器，直接 node 运行
├── napcat-readme.md        ← 本说明
├── src/                    ← 分类规则（可自行修改）
│   └── classifier/categories.ts
└── QQ群文件分类/            ← 分类结果自动生成
    ├── 群名1/
    │   ├── 📄 文档-作业报告/
    │   ├── 🖼️ 图片-截图/
    │   └── ...
    └── 群名2/
```
