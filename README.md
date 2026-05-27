# AI 页面翻译

Chrome/Edge 浏览器扩展，使用 DeepSeek API 将页面内容翻译为任意语言，翻译结果显示在原文下方，不破坏原页面布局。

## 项目结构

```
├── manifest.json              # MV3 扩展清单
├── icons/
│   ├── icon-16.png            # 工具栏图标 (16px)
│   ├── icon-48.png            # 扩展管理页图标 (48px)
│   └── icon-128.png           # 商店展示图标 (128px)
├── popup/
│   ├── popup.html             # 设置窗口 UI
│   ├── popup.js               # 读写 chrome.storage
│   └── popup.css              # 窗口样式
├── content/
│   ├── content.js             # DOM 文本提取、翻译注入、划词翻译
│   └── content.css            # 翻译结果样式
└── background/
    └── service-worker.js      # DeepSeek API 调用、内存缓存
```

## 架构

```
┌──────────────┐  chrome.runtime.sendMessage  ┌──────────────┐     HTTP POST     ┌─────────────┐
│  Content     │ ────────────────────────────→ │  Service     │ ────────────────→ │  DeepSeek   │
│  Script      │ ←──────────────────────────── │  Worker      │ ←──────────────── │  API        │
└──────┬───────┘      sendResponse             └──────┬───────┘                   └─────────────┘
       │                                              │
       │ DOM 文本提取 / 翻译注入                        │ chrome.storage.local
       ▼                                              ▼
┌──────────────┐                              ┌──────────────┐
│   Page DOM   │                              │   Settings   │
└──────────────┘                              └──────┬───────┘
                                                     ▲
                                                     │ 读写设置
                                              ┌──────┴───────┐
                                              │   Popup UI   │
                                              └──────────────┘
```

## 关键设计

| 机制 | 说明 |
|------|------|
| Self-avoidance | 注入 DOM 带 `data-tp-extension` 属性，TreeWalker 自动跳过 |
| 防重复 | 已翻译文本节点用 WeakMap 追踪 |
| 语言检测 | 手动设置源语言 = 目标语言时跳过；自动检测时根据 `<html lang>` 判断 |
| 动态内容 | MutationObserver 监听 DOM 变化，500ms 防抖后翻译新增内容 |
| 批量请求 | 每批最多 20 条文本合并为一次 API 调用 |
| 缓存 | Service Worker 内 Map 缓存，同文本不重复请求 |
| 性能 | requestAnimationFrame 分批处理 DOM，scheduler.yield 让出主线程 |

## 安装

1.下载release内zip压缩包
2. 打开 `chrome://extensions/`（Edge: `edge://extensions/`）
3. 开启右上角「**开发者模式**」
4. 拖入zip文件

## 使用

### 初始配置

1. 点击工具栏扩展图标，打开设置窗口
2. 展开「**API 设置**」，填入 DeepSeek API Key
3. 确认目标语言和翻译字号（8–18px，默认 12px）
4. 关闭窗口，设置自动保存

### 翻译操作

| 操作 | 方式 |
|------|------|
| 启用/停用 | 切换设置窗口的开关，翻译自动出现/消失 |
| 切换目标语言 | 在下拉菜单中更改语言，页面自动重新翻译 |
| 调整字号 | 拖动「翻译字号」滑块，所有翻译实时更新 |
| 划词翻译 | 选中页面文字，弹出翻译结果 |
| 查看版本 | 设置窗口底部显示 `v1.0.0` |

### 语言支持

| 角色 | 选项 |
|------|------|
| 源语言 | 自动检测 / 中文 / English / 日本語 / 한국어 / Français / Deutsch / Español / Русский |
| 目标语言 | 中文 / English / 日本語 / 한국어 / Français / Deutsch / Español / Русский |

## 隐私

- API Key 仅存储在浏览器本地 `chrome.storage.local`，不上传任何第三方
- 翻译请求直接从浏览器发送至你配置的 API Endpoint
- 插件不收集用户数据或浏览记录

### 更换图标

替换 `icons/` 目录下的 PNG 文件（保持 16×16、48×48、128×128 三个尺寸，名称不变），重新加载扩展即可。


## 更新日志

### v1.0.0

- 支持整页自动翻译，翻译结果显示在原文下方
- 支持划词翻译
- 支持 DeepSeek API，用户自定义 API Key 和 Endpoint
- 支持自动检测页面语言，与目标语言相同时跳过翻译
- 支持 8 种源语言和目标语言
- 翻译字号可拖拽调节（8–18px）
- 开关即时控制翻译的显示与隐藏
- 动态内容自动翻译（MutationObserver 监听）
- 默认deepseek图标

## 许可

MIT
