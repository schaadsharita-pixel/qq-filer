/**
 * 文件类别定义
 * 按后缀 + 关键词匹配规则组织
 */

export interface Rule {
  exts?: string[];
  keywords?: string[];
}

export interface SubCategory {
  name: string;
  rules: Rule[];
}

export interface Category {
  name: string;
  icon: string;
  subCategories?: SubCategory[];
  rules?: Rule[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  {
    name: '文档',
    icon: '📄',
    subCategories: [
      {
        name: '作业报告',
        rules: [
          {
            exts: ['.doc', '.docx', '.pdf', '.txt', '.md'],
            keywords: ['作业', '报告', '总结', '论文', '课题', '实习', '实验']
          }
        ]
      },
      {
        name: '商务文档',
        rules: [
          {
            exts: ['.pdf', '.doc', '.docx'],
            keywords: ['合同', '协议', '发票', '报价', '标书', '商务', '采购']
          }
        ]
      },
      {
        name: '简历',
        rules: [
          {
            exts: ['.pdf', '.doc', '.docx'],
            keywords: ['简历', '履历', 'CV', 'resume']
          }
        ]
      }
    ]
  },
  {
    name: '图片',
    icon: '🖼️',
    subCategories: [
      {
        name: '截图',
        rules: [
          {
            exts: ['.png', '.jpg', '.jpeg', '.bmp'],
            keywords: ['截图', '截屏', 'screen', '屏幕']
          }
        ]
      },
      {
        name: '照片',
        rules: [
          {
            exts: ['.jpg', '.jpeg', '.png', '.bmp', '.heic', '.raw', '.webp', '.gif'],
            keywords: ['合照', '照片', 'photo', 'img', 'pic', 'gif']
          }
        ]
      },
      {
        name: '设计素材',
        rules: [
          {
            exts: ['.psd', '.ai', '.sketch', '.fig'],
            keywords: ['设计', 'UI', '原型', 'banner', '海报', '素材']
          }
        ]
      }
    ]
  },
  {
    name: '压缩包',
    icon: '📦',
    rules: [
      { exts: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst', '.iso'] }
    ]
  },
  {
    name: '代码',
    icon: '💻',
    rules: [
      {
        exts: ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c',
               '.h', '.hpp', '.go', '.rs', '.vue', '.css', '.scss', '.html',
               '.php', '.rb', '.swift', '.kt', '.scala', '.sql', '.sh', '.bat', '.ps1']
      }
    ]
  },
  {
    name: '安装包',
    icon: '⚙️',
    rules: [
      { exts: ['.exe', '.msi', '.dmg', '.AppImage', '.deb', '.rpm', '.pkg'] }
    ]
  },
  {
    name: '表格',
    icon: '📊',
    rules: [
      {
        exts: ['.xls', '.xlsx', '.csv'],
        keywords: ['统计', '数据', '报表', '表格', '记录', '登记']
      }
    ]
  },
  {
    name: '音视频',
    icon: '🎬',
    rules: [
      { exts: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv',
               '.mp3', '.wav', '.flac', '.aac', '.wma', '.ogg'] }
    ]
  },
  {
    name: 'PPT',
    icon: '📽️',
    rules: [
      { exts: ['.ppt', '.pptx'] }
    ]
  }
];
