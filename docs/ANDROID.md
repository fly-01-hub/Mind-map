# 安卓平板与完整备份（1.7.0）

核验日期：2026-10-04。源码/安卓包为 1.7.0，本机已安装 Windows 程序仍为 1.6.0；本轮未重装 Windows、未重新部署旧公网网页。

## 安装与迁移

本地安装包：`release/ResearchMind-1.7.0-android.apk`，4,666,745 字节（约 4.45 MiB）。SHA-256：`B963598AF793E7AECCACDF8D5A42D603B3E799066D2BEA55D0F19D6D6674BE88`。

包名 `com.fly01hub.researchmind`；versionName `1.7.0`，versionCode `10700`；最低安装系统 Android 9/API 28，目标 API 35，无特定 CPU 架构的原生库限制。安装门槛不等于 WebView 兼容保证：编辑器/PDF.js 还需设备可用的新版 Android System WebView，老旧 WebView 不保证兼容。保留设备安全保护，安装被拦截时不要绕过检查。

1. 将 APK 复制到平板，用系统文件管理器打开并按提示安装。
2. 在电脑“备份与恢复”中创建 `.researchmind` 备份，把该文件复制到平板。
3. 平板点击“备份与恢复 / 从备份恢复”，通过系统文件选择器选文件并确认替换。
4. 编辑后重新导出备份，放到独立安全目录；卸载/清除应用数据前必须先备份。

没有连接用户的真实平板，不宣称已安装到平板或完成真机输入法、系统文件选择器和升级验证。此版本优先适配平板，横屏编辑更宽裕，不是完整手机体验。

## 完整备份与备份文件夹

完整备份包含数据库全部 11 张表：文档/导图的同一份节点树、嵌套文件夹及所属关系、收藏和回收站、历史版本、附件二进制、论文信息及 PDF 二进制、阅读页码/缩放、批注、节点与论文关系、批注与节点关系、数据库元信息。富文本、图片、笔记、标签、双向链接和旧名称保留在文档/节点中。

`.researchmind` 是单个未加密备份文件。保管好存放它的文件夹，换设备后选择其中的备份文件即可恢复，包括文件夹层级和回收站，不依赖原始附件/PDF 的外部路径。不支持扫描任意文件夹自动还原。Windows 应用配置目录副本不能直接导入安卓，跨设备请使用 `.researchmind`。

恢复校验格式后，在同一事务中整体替换数据库，失败回滚；不是合并。恢复前先备份平板已有资料。格式仍为 v1，数据库仍为 v3，与旧桌面/网页备份兼容。不包含 localStorage 界面偏好、窗口尺寸、内存撤销栈、程序本身或操作系统配置；无自动同步、云账户或加密。

安卓单次导出上限 512 MB，超出明确报错。Base64 文件比原二进制约大三分之一，大资料库生成/恢复仍受设备内存限制，建议在电脑处理。

## 实现与安全

- APK 内置生产资源，WebViewAssetLoader 使用固定本地 HTTPS 来源；SPA 路由重开返回应用入口。不依赖开发服务器或应用账号。
- 不申请联网、所有文件访问、账号、相机或麦克风权限。远端资源不能进入带文件接口的 WebView；用户打开的 http/https 超链接交给外部浏览器。
- 系统 Storage Access Framework 负责选择/保存文件，电脑传来的未知 MIME `.researchmind` 也可选择；没有任意目录读取权限。
- 消息桥限定固定来源和主框架，不使用 `addJavascriptInterface`。192 KiB 分块、逐块确认、校验总大小；最终写入完成才显示已保存，取消不报成功。写入失败可能留下不完整目标文件，不能将其当有效备份。
- 保留系统打印入口；能否“保存 PDF”取决于系统打印服务，打印不是完整备份。
- 安卓独立平板样式、可横向滚动的工具栏；触屏拖动不进入鼠标空白框选。普通网页和 Windows 布局不受这些样式影响。
- 安卓不注册网页 SW，避免旧网页缓存干扰 APK 更新。暂停时提交文字并尝试刷新保存；PDF 页码/缩放立即保存，不因快速离开取消延迟任务。
- Android 云备份关闭，Android 12+ 云备份/设备转移规则也排除资料。显式 `.researchmind` 导出是应用提供的迁移渠道。

本包是 `debuggable=false` 的 release 构建，使用本机现有 Android 调试密钥作个人安装签名，不是商店发布签名。APK v2 签名验证通过；证书 SHA-256：`8247485b6b7f3ff1ca19f57e83f7466a40cd5f79a747fae4613a55eff34433b2`。

后续覆盖升级必须保留同一密钥并递增 versionCode；不同电脑默认调试密钥通常不同。私下保管本机 `.android/debug.keystore`，不要上传 GitHub。签名变化时不要直接卸载带资料的旧程序，应先导出备份。

## 构建

依赖 Node.js 24、JDK 17、Android SDK 平台 35 和 build-tools 34/35。仓库自带 Gradle 8.11.1 Wrapper，发行包固定官方 SHA-256。首次安装构建依赖需联网，日常应用使用无需构建服务器。

```powershell
npm ci
# 仅为当前构建进程设置实际工具链路径，不修改系统配置。
$env:JAVA_HOME='你的 JDK 17 目录'
$env:ANDROID_HOME='你的 Android SDK 目录'
npm run android:build
```

输出到 `release/`；依赖缓存完整时可设置当前进程 `RESEARCHMIND_ANDROID_OFFLINE=1`。`android:prepare` 只覆盖固定的生成目录 `android/app/src/main/assets/web/`，不复制或删除用户资料。

## 三轮审查与验证边界

数据：49 单元测试通过，包括全部表/二进制往返、嵌套文件夹和归属、回收站、非合并恢复、损坏格式拒绝、事务写入失败后全部表回滚。TypeScript、lint、生产构建通过。

交互与视觉：5 安卓专项通过，使用隔离浏览器上下文、安卓来源和模拟原生消息回复，其中 4 项直接验证生产资源。覆盖分块逐字节一致、取消/空文件、打印请求、触屏新建导图、导图/大纲双击链接、反向定位、重开保留、备份 UI 导出/恢复文件夹和文档、800×1280 竖屏、离线 PDF worker/文字/翻页和页码恢复、无 SW 注册。检查导图、大纲、知识库和 PDF 截图，修正安卓 PDF 工具栏挤压。不是实际 Android WebView、系统保存器、真机手指或软键盘验收。

回归与包检查：60 原有 Chrome 用例全部通过；原有已打包 1.6.0 桌面壳在隔离目录中的重开测试 1 项通过（不是 1.7.0 Windows 安装包验收）。Android assembleRelease、lintRelease 通过；lint 0 错误，保留 JavaScript 必需及备份规则兼容提示两项警告，相关配置已人工审查。签名、包名/版本/最低系统和权限核验通过，APK 生产资源与 dist 逐文件核对。测试端口/输出目录独立，避免互相关闭服务器或清理痕迹。

未修改用户日常资料、未用个人论文测试；release、个人备份、SDK 本地路径、生成资源、构建缓存和签名密钥均不提交。构建通过不等于所有平板/历史数据零缺陷。

依据：[本地 WebView 内容](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[系统文件选择/保存](https://developer.android.com/training/data-storage/shared/documents-files)、[原生桥安全](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)、[备份规则](https://developer.android.com/identity/data/autobackup)。
