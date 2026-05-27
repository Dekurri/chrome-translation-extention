# AI 页面翻译

Chrome/Edge 浏览器扩展，使用 DeepSeek API 将页面内容翻译为任意语言，翻译结果显示在原文下方，不破坏原页面布局。

## 架构

```
┌──────────────┐   chrome.runtime.sendMessage   ┌──────────────┐      HTTP POST      ┌─────────────┐
│  Content     │ ──────────────────────────────→ │  Service     │ ──────────────────→ │  DeepSeek   │
│  Script      │ ←────────────────────────────── │  Worker      │ ←────────────────── │  API        │
│ content.js   │       sendResponse              │ sw.js        │      JSON           │             │
└──────┬───────┘                                 └──────┬───────┘                     └─────────────┘
       │                                                │
       │ DOM 文本提取 / 翻译注入                          │ chrome.storage.local
       ▼                                                ▼
┌──────────────┐                                 ┌──────────────┐
│   Page DOM   │                                 │   Settings   │
└──────────────┘                                 └──────┬───────┘
                                                        ▲
                                                        │ 用户读写设置
                                                ┌───────┴───────┐
                                                │    Popup UI   │
                                                │  popup.html   │
                                                └───────────────┘
```

### 文件职责

| 文件 | 职责 |
|------|------|
| `manifest.json` | MV3 扩展清单，声明权限和入口 |
| `popup/popup.html` | 设置窗口 UI |
| `popup/popup.js` | 读写 chrome.storage，响应用户设置变更 |
| `popup/popup.css` | 设置窗口样式 |
| `content/content.js` | DOM 文本提取（TreeWalker）、翻译注入、MutationObserver 动态监控、划词翻译 |
| `content/content.css` | 翻译结果显示样式（灰蓝左边框） |
| `background/service-worker.js` | 消息中转、DeepSeek API 调用、内存缓存 |

### 关键设计

- **Self-avoidance**：所有扩展注入的 DOM 元素携带 `data-tp-extension` 属性，文本提取时自动跳过
- **防重复翻译**：已翻译文本节点用 WeakMap 追踪
- **动态内容**：MutationObserver 监听 DOM 变化，500ms 防抖后翻译新增内容
- **批量 API 调用**：每批最多 20 条文本合并为一次 API 请求，减少调用次数
- **内存缓存**：Service Worker 内 Map 缓存已翻译文本，避免重复请求
- **主线程友好**：requestAnimationFrame 分批处理 DOM 操作，scheduler.yield 让出主线程

## 安装

1. 下载项目代码
2. 打开 `chrome://extensions/`（Edge: `edge://extensions/`）
3. 开启右上角「**开发者模式**」
4. 点击「**加载已解压的扩展程序**」
5. 选择项目文件夹

## 使用

### 初始设置

1. 点击浏览器工具栏的扩展图标
2. 展开「**API 设置**」折叠面板
3. 填入你的 DeepSeek API Key
4. API Endpoint 默认 `https://api.deepseek.com/v1/chat/completions`，如有代理可修改
5. 模型默认 `deepseek-chat`

### 翻译操作

| 操作 | 方式 |
|------|------|
| 启用/停用翻译 | 点击扩展图标，切换开关 |
| 更改目标语言 | 在 Popup 中选择语言，页面自动重新翻译 |
| 划词翻译 | 选中页面文字，自动弹出翻译结果 |
| 关闭翻译 | 关闭开关，翻译自动消失，页面恢复原状 |

### 语言支持

源语言支持自动检测，目标语言可选：中文、English、日本語、한국어、Français、Deutsch、Español、Русский。

## 隐私

- API Key 存储在浏览器本地 `chrome.storage.local`，不上传任何第三方服务器
- 翻译请求直接从浏览器发送至配置的 API Endpoint
- 插件不收集任何用户数据或浏览记录

## 打包分发

```bash
# 排除开发文件后打包
zip -r ai-translate.zip . -x ".git/*" ".agents/*" "skills-lock.json" ".gitignore"
```

## 许可

MIT
