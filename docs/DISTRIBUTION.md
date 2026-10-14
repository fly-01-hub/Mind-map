# 免费分发与维护

本项目免费提供使用，完整开发工程与源码历史保持私有。Windows 安装包通过 GitHub Releases 分发，网页版通过 GitHub Pages 提供。没有购买服务器、域名或订阅；不增加云数据库、账号或收费 API。

- 私有源码：`fly-01-hub/Mind-map`，保持 Private。
- 公开下载与教程：https://github.com/fly-01-hub/Mind-map-download
- 在线使用：https://fly-01-hub.github.io/Mind-map-download/
- 公开 main 分支放使用说明和经检查的虚构示例演示素材，gh-pages 分支只放审查后的网页构建资源，Release 只上传指定版本的 EXE/APK。

网页在 Pages 子目录下使用 hash 路由。默认本机/PWA、Windows、安卓仍使用原有路由、来源与资料空间。网页版采用独立的浏览器资料空间；各用户资料不上传 GitHub，不自动同步。用完整 `.researchmind` 备份迁移，恢复会整体替换目标库。

1.7.8 起，PDF 在独立阅读页和导图分栏中均支持上下连续滚动。页码随滚动更新；输入页码、上一页/下一页及搜索结果仍可跳转，上下方向键和 PageUp/PageDown 用于滚动。页内位置保存在原有阅读记录的 `scrollOffset` 中，采用 0～1 的页面高度比例，旧记录的 0 保持兼容；关闭和重开可恢复位置，缩放时保留页内比例。数据库 schema 和完整备份版本不变。

`ContinuousPdfViewer` 保留轻量页槽，仅在视口附近渲染 PDF 画布和文字层；不同尺寸页面加载时保持阅读位置。批注按页分组；明确选择批注时定位一次，普通滚动和状态刷新不反复拉回批注。发布验证包含 20 页、不同纸张高度、末页、滚轮跨页、缩放/恢复、独立阅读与分栏；本地及公网 Pages 检查也实际滚动到第 2 页。

## 后续更新

修改代码并递增 package.json 与 package-lock.json 的版本后，运行：

```powershell
npm run release:public
```

该命令依次检查类型、单元测试与 lint，构建 Windows 安装包，核对包内网页资源和隐私边界，测试生产网页及独立桌面配置，再构建、测试 Pages 版本并发布，等待公网提供同一网页构建后执行公网浏览器验证。它复用本机已有 GitHub 登录；凭据只在进程内存中使用，不写入代码、日志或临时文件。

源码不会从当前工作目录推送到公开仓库。发布脚本通过 GitHub API，以审查后的静态文件建立独立 Git tree，并核对二进制资源的 Git 哈希；不复制当前源码仓库的 Git 对象。公开分支保留自己的构建历史，与私有源码历史不关联。发布前再次核对私有源码仓库的可见性和公开目标仓库。

如需先检查产物、生成发布说明及校验清单：

```powershell
node scripts/publish-public.mjs --prepare
```

同时发布安卓 APK 时，先执行 `npm run android:build` 并验证签名、版本和包内资源；准备命令使用 `node scripts/publish-public.mjs --prepare --with-android`，发布使用 `node scripts/publish-public.mjs --publish --with-android`。两种安装包在同一草稿中上传、核对大小与 SHA-256 后才公开；公开指南的安卓段落独立替换，避免沿用旧版本名或旧校验值。

准备产物在 `release/public-<version>.md` 和 `release/public-<version>-manifest.json`。查看远端发布和 Pages 构建状态：

```powershell
node scripts/publish-public.mjs --status
```

已发布版本的安装包不会被静默覆盖。发布中断时，确认草稿中的安装包 SHA-256 与本机一致后，可再次运行 `npm run publish:public`；无需重新打包已验证且未改变的产物。

## 分发边界

公开仓库首页展示实际应用的导图与 PDF 分栏截图、约 30 秒 GIF 和 MP4；About 网址指向免费网页版，Topics 使用功能相关标签。演示中的 PDF 和导图专门编写，录制使用 Playwright 临时配置，不能截取用户日常知识库。

`scripts/promote-public.mjs --inspect` 可读取当前仓库访问、来源和各版本下载数，快照仅保存在 Git 忽略的 `release/promotion/traffic-*.json` 中。仓库访问是 GitHub 返回的最近 14 天数据，可能包含开发/验证访问；Release 下载数是累计数，两者都不等于活跃用户数。未增加第三方埋点、付费服务或定时任务。

宣传素材可用 `scripts/make-demo-pdf.py`、`scripts/capture-promotion.mjs`、`scripts/convert-promotion.py` 重新制作；需要已构建的本机 4173 网页、Chrome，以及 Python 的 reportlab、PyMuPDF、Pillow 和 imageio-ffmpeg。使用 Windows 微软雅黑字体；只在本机渲染示例，不分发字体文件。PDF 新建前按 PDF 技能执行操作标记，生成后检查预览 PNG。

`scripts/prepare-promotion.mjs` 在保留现有完整使用指南的基础上准备首屏介绍及可复用分享文案。人工检查截图、GIF/视频、文案与链接后，`scripts/promote-public.mjs --publish` 仅上传明确列出的说明、PNG/GIF/MP4 和分享文案；通过公开仓库自身的 Git tree 提交，不推送私有源码历史。后续正常安装包发行会保留首页介绍和演示。视频中的步骤字幕及文件拖动提示为说明层，功能过程使用实际应用录制。

本轮用户选择只发布到 GitHub；不代发到其他平台或社群。分享文案已放入公开仓库 `promotion/share-copy.txt`，便于以后按需复用。

仅分发安装包和网页构建文件，并不等于加密程序。浏览器需要获取 JavaScript，Electron 安装包也包含可提取的运行资源。原始 TypeScript 工程、开发注释与私有 Git 历史保持私有，不承诺防逆向。

个人导图、论文、备份、数据库、真实资料截图、TLS 密钥、本机配置和凭据不能加入公开仓库。安装包未提供可信商业代码签名；遇系统阻止时停止，不关闭安全保护。

GitHub 的免费服务受额度和政策限制。当前模式没有自建服务器维护和云资料存储费用；应用修复与版本发布仍需要维护时间。
