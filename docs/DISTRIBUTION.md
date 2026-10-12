# 免费分发与维护

本项目免费提供使用，完整开发工程与源码历史保持私有。Windows 安装包通过 GitHub Releases 分发，网页版通过 GitHub Pages 提供。没有购买服务器、域名或订阅；不增加云数据库、账号或收费 API。

- 私有源码：`fly-01-hub/Mind-map`，保持 Private。
- 公开下载与教程：https://github.com/fly-01-hub/Mind-map-download
- 在线使用：https://fly-01-hub.github.io/Mind-map-download/
- 公开 main 分支只放使用说明，gh-pages 分支只放审查后的网页构建资源，Release 只上传指定版本的 EXE。

网页在 Pages 子目录下使用 hash 路由。默认本机/PWA、Windows、安卓仍使用原有路由、来源与资料空间。网页版采用独立的浏览器资料空间；各用户资料不上传 GitHub，不自动同步。用完整 `.researchmind` 备份迁移，恢复会整体替换目标库。

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

准备产物在 `release/public-<version>.md` 和 `release/public-<version>-manifest.json`。查看远端发布和 Pages 构建状态：

```powershell
node scripts/publish-public.mjs --status
```

已发布版本的安装包不会被静默覆盖。发布中断时，确认草稿中的安装包 SHA-256 与本机一致后，可再次运行 `npm run publish:public`；无需重新打包已验证且未改变的产物。

## 分发边界

仅分发安装包和网页构建文件，并不等于加密程序。浏览器需要获取 JavaScript，Electron 安装包也包含可提取的运行资源。原始 TypeScript 工程、开发注释与私有 Git 历史保持私有，不承诺防逆向。

个人导图、论文、备份、数据库、截图、TLS 密钥、本机配置和凭据不能加入公开仓库。安装包未提供可信商业代码签名；遇系统阻止时停止，不关闭安全保护。

GitHub 的免费服务受额度和政策限制。当前模式没有自建服务器维护和云资料存储费用；应用修复与版本发布仍需要维护时间。
