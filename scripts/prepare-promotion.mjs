import fs from 'node:fs'
import path from 'node:path'

const output = path.resolve('release/promotion')
const staging = path.join(output, 'public')
fs.mkdirSync(path.join(staging, 'promotion'), { recursive: true })
const guide = fs.readFileSync(path.join(output, 'public-guide.original.txt'), 'utf8')
const tutorialStart = guide.indexOf('## 在线使用（免费）')
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
if (tutorialStart < 0 || !guide.includes(`当前版本：**${version}**`)) throw new Error('Review current public guide before preparing promotion')
const tutorial = guide.slice(tutorialStart)
  .replace('仅包含本下载仓库的说明文档', '包含本下载仓库的说明文档和虚构示例演示素材')
  .replace('公开仓库的 main 分支提供说明文档，', '公开仓库的 main 分支提供说明文档和虚构示例演示素材，')
const intro = `# ResearchMind 枝间 · 免费 PDF 阅读与思维导图

把文献、批注和阅读笔记放进同一张思维导图。无需注册，支持网页版与 Windows 桌面版，资料保存在当前设备。

**[立即在线体验](https://fly-01-hub.github.io/Mind-map-download/)** · **[下载 Windows 安装包](https://github.com/fly-01-hub/Mind-map-download/releases/latest)** · [反馈问题](https://github.com/fly-01-hub/Mind-map-download/issues)

![ResearchMind 枝间：PDF 阅读与思维导图分栏](assets/pdf-reading.png)

## 30 秒看看怎样使用

![拖入 PDF、双击分栏、高亮生成节点的真实演示](assets/demo.gif)

[播放或下载 MP4 演示](https://raw.githubusercontent.com/fly-01-hub/Mind-map-download/main/assets/demo.mp4) · [查看纯导图界面](assets/mindmap.png) · [分享介绍文案](promotion/share-copy.txt)

演示录制于实际应用，使用专门编写的虚构 PDF 和示例导图，不含个人资料。视频中的步骤字幕与文件拖动提示用于说明操作。

## 适合哪些事情

| 你的需求 | 可以怎样使用 |
| --- | --- |
| 阅读文献时反复切换窗口 | 把 PDF 拖到节点，双击文献节点，在同一页阅读原文和查看导图 |
| 想把关键句整理成结构 | 在分栏阅读中选中文字并高亮，生成带来源关联的文献子节点 |
| 整理学习笔记或写作提纲 | 在大纲中快速输入，在导图中查看结构，两种视图共用内容 |
| 希望资料保存在自己设备 | 内容保存在当前浏览器或桌面程序，支持完整备份迁移 |

首次打开为空白知识库；网页版首次在线加载缓存后支持离线使用。不同设备、浏览器和桌面版之间不自动同步，请定期导出完整备份。

欢迎试用并通过 Issues 提出建议。如果它对你有帮助，可以 Star 收藏或分享给有同样需求的人。

本项目免费分发，源码保持私有。本仓库提供使用说明、演示素材、Windows 安装包入口，以及 gh-pages 分支中的网页运行资源。

`;
fs.writeFileSync(path.join(staging, 'README.md'), intro + tutorial)
fs.writeFileSync(path.join(staging, 'redme.txt'), intro + tutorial)
const copy = `ResearchMind 枝间：可直接使用的分享文案

【一句话介绍】
免费的 PDF 阅读与思维导图工具，让文献、批注和阅读笔记连在一起；支持网页版和 Windows，资料保存在当前设备。

【社群简短介绍】
我做了一个免费的文献阅读与思维导图工具：ResearchMind 枝间。
把 PDF 拖到导图节点，双击即可分栏阅读；选中关键句并高亮，还能生成关联原文的导图节点。
不用注册，支持网页版和 Windows，内容保存在当前设备。首次打开为空白，不预置示例资料。
欢迎有论文阅读、学习笔记或提纲整理需求的朋友试用，也欢迎反馈不好用的地方。
在线体验：https://fly-01-hub.github.io/Mind-map-download/
下载与反馈：https://github.com/fly-01-hub/Mind-map-download

【B 站标题】
我做了一个免费的 PDF + 思维导图工具：边读文献，边整理笔记

【B 站视频简介】
ResearchMind 枝间是一款免费使用的 PDF 阅读与思维导图工具。
这段约 30 秒的演示展示：PDF 拖入节点、双击分栏阅读、选句高亮生成关联节点。
演示 PDF 与导图均为专门编写的虚构示例。
网页版：https://fly-01-hub.github.io/Mind-map-download/
Windows 安装包与问题反馈：https://github.com/fly-01-hub/Mind-map-download
资料保存在当前设备；不同浏览器、网页版与桌面版不自动同步，可用完整备份迁移。
首次在线加载缓存后，网页版可离线使用。项目免费分发，源码保持私有。
关键词：思维导图、PDF阅读、论文阅读、学习笔记、知识管理

【知乎介绍】
标题：读 PDF 时怎样把文献与思维导图放在一起？我做了一个免费的工具

整理文献时，我希望把原文与笔记放在同一个页面，于是制作了 ResearchMind 枝间。
使用流程很简单：先新建导图，把 PDF 拖到需要的节点，再双击生成的文献节点。页面会分为 PDF 阅读区与思维导图区。
在分栏中选中关键句并高亮，可以生成带来源关联的文献子节点，方便之后回到原文核对。
它还支持大纲输入、导图查看、自动保存和完整备份；适合整理阅读笔记、学习资料及写作提纲。
工具免费使用，无需注册或配置付费 API，提供网页版和 Windows 安装包。资料保存在当前设备，不自动跨设备同步。
在线体验：https://fly-01-hub.github.io/Mind-map-download/
下载与反馈：https://github.com/fly-01-hub/Mind-map-download
欢迎试用并反馈你的使用体验。本文介绍的软件由我制作；项目免费分发，源码保持私有。

【30 秒视频步骤】
开场：ResearchMind 枝间，免费 PDF 阅读与思维导图。
第一步：将 PDF 拖到节点，自动生成文献子主题。
第二步：单击选中，双击文献节点打开分栏。
第三步：选中关键句并高亮，生成关联原文的导图节点。
结尾：在同一页阅读和整理。点击简介里的链接即可体验。
`;
fs.writeFileSync(path.join(staging, 'promotion/share-copy.txt'), copy)
console.log('Prepared reviewed public homepage and reusable share copy; existing usage guide retained.')
