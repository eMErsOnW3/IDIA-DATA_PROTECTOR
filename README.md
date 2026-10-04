# IDIA Data Protector

**Review sensitive information before sharing it with AI.**

IDIA Privacy Protector is a Manifest V3 browser extension that detects sensitive information locally, lets you choose what to protect, and replaces selected text with conversation-scoped tokens. PDF and image protection uses permanent pixel redaction. No account, API key, remote OCR service, or build step is required.

**Version 0.6.0 · Chrome extension · Local processing · English / 简体中文 / 日本語 OCR**

[中文说明](#中文说明) · [Install](#install) · [Usage](#usage) · [Privacy](#privacy-and-session-lifetime) · [Limitations](#limitations) · [Source terms](#source-availability)

## What it does

- **Review before sending.** Detect email addresses, supported phone-number formats, Chinese resident IDs, US Social Security numbers, payment-card patterns, IPv4 addresses, and selected address patterns. Choose individual findings to protect.
- **Keep text useful.** Selected text becomes opaque tokens such as `[IDIA_EMAIL_<32 hexadecimal characters>]`. Exact values share a token only within the same conversation and data type.
- **Protect attachments.** Create protected copies of text files, Office documents, PDFs, and images. Original files on disk are unchanged.
- **Decode locally.** Paste a protected AI response into the Decode panel, or select a supported file, to restore exact tokens using the current session's mappings.
- **Run local OCR.** Bundled English, Simplified Chinese, and Japanese models process scanned pages and images without downloading models at runtime.

## Install

1. Download this repository with **Code → Download ZIP**, then extract it, or clone it:

   ```sh
   git clone https://github.com/eMErsOnW3/IDIA-DATA_PROTECTOR.git
   ```

2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted/cloned folder containing `manifest.json`.
4. Pin **IDIA Privacy Protector**, open a supported AI website, and refresh its tab.
5. Open the extension popup and check that **Enable protection** is on and a composer is detected.

The manifest declares Chrome 114 as its minimum version. Use a current Chrome release; this publication does not establish compatibility with every older browser or other Chromium browser. This repository provides an unpacked extension, not a Chrome Web Store installation.

After moving the extension folder, load it from its new location. After updating it, reload the extension and refresh open AI tabs. **Decode any needed values before reloading: extension reloads clear session mappings.**

## Supported platforms

Adapters are included for **ChatGPT, Gemini, Claude, DeepSeek, Microsoft Copilot, Perplexity, and Grok**. Injection is restricted to their HTTPS domains listed in `manifest.json`.

Adapters have simulated compatibility coverage. Authenticated live compatibility across all seven platforms is not established by this release. Website changes, custom editors, and upload controls can affect protection; the popup reports composer detection and integration status.

## Usage

### Protect a message

1. Type or paste a draft into a supported AI composer.
2. Open **Review** when IDIA finds sensitive information. A detected send attempt with unreviewed findings also opens the review dialog.
3. Select the occurrences to replace, then click **Protect Selected**.
4. Inspect the updated draft and send it yourself. IDIA never clicks Send.

Unchecked findings remain visible. **Cancel** leaves the draft unchanged; clearing all selections and choosing **Protect Selected** explicitly keeps the draft as written.

### Protect an attachment

Use the website's normal file picker. For supported file inputs, IDIA pauses the selection, scans locally, and opens **IDIA File Privacy Check**. Choose findings and click **Protect File**. A protected `-safe` copy replaces the selected file in the browser; the website may then upload it automatically.

### Restore text or files

Click **IDIA · Decode** at the bottom right of a supported AI page.

- **Text:** paste the protected response and click **Decode**.
- **File:** choose TXT, CSV, DOCX, or XLSX, inspect the recognized token count, click **Decode File**, then **Download Decoded**.
- The popup's **Decode Local File** opens a separate local view for a selected conversation.

Only exact tokens belonging to the selected conversation and current browser session can be restored. Unknown, altered, or other-conversation tokens remain unchanged. PDF/image redactions cannot be decoded.

## File support

| Input | Protection | Local restore |
| --- | --- | --- |
| Text in a supported composer | Selected findings → session tokens | Yes |
| TXT / CSV | Selected text → session tokens | Yes |
| DOCX | Supported paragraph text → session tokens | Yes |
| XLSX | Supported textual cells → session tokens | Yes |
| PDF, including scanned pages | Rendered pages with opaque redaction → new image-only PDF | No |
| PNG / JPG / JPEG | Local OCR + opaque pixel redaction → re-encoded image | No |

Text/Office inputs are limited to **5 MiB**. PDF inputs are limited to **25 MiB and 50 pages**. Images are limited to **25 MiB, 8 million decoded pixels, and 8192 pixels per dimension**. Additional workload limits apply; large jobs may request confirmation or be rejected.

## Privacy and session lifetime

Detection, document processing, OCR, and decoding run locally. Runtime libraries, workers, fonts, character maps, and OCR models are bundled in `lib/`; the extension does not use a remote privacy-processing endpoint or telemetry service.

The only declared extension permission is **`storage`**. Content scripts run on the explicitly listed AI domains; selected local files are read for processing. The enabled/disabled preference is saved in `chrome.storage.local`.

Token mappings are held in **`chrome.storage.session`**, with access restricted to trusted extension contexts. They are scoped by platform and conversation. Mappings survive page refresh and service-worker suspension, but are lost when the vault is cleared, the browser restarts, or the extension is reloaded, updated, or disabled. There is no persistent mapping backup or recovery feature.

Decoded results are displayed in extension-origin views. Exported files and clipboard copies contain restored values and should be handled accordingly. The AI website still receives whatever you choose to send, including unselected or undetected information. A webpage can also observe text entered into its own editor before protection is applied.

## Limitations

- Detection is rule-based and can miss information or produce false positives. General person-name detection is not implemented.
- Protection depends on recognized composers and standard file-input events. General attachment drag-and-drop, custom upload paths, and unsupported formats are not intercepted.
- CSV is handled as text. DOCX/XLSX protection does not sanitize every possible document component, embedded object, metadata field, or numeric cell. Modified rich text may lose formatting; shared XLSX strings affect every cell using that string.
- PDF output loses searchable text, links, forms, and vector editability. OCR can miss or misread information. Image redaction covers whole recognized lines and may cover neighboring text on the same line.
- Image output removes source metadata and flattens transparency onto white. JPEG is re-encoded with quality loss. HEIC, HEIF, and TIFF are unsupported.
- Tokens are reversible placeholders backed by a session mapping; they are not encrypted copies of the original data. A lost mapping cannot be reconstructed from a token.

Always inspect the protected result before sharing it.

## Project layout

```text
manifest.json          Entry points, permissions, and site matches
background.js          Trusted session-vault message handling
content.js             Composer review and send interception
detectors.js           Local detection rules
tokenVault.js          Session mappings and conversation isolation
popup.*                Extension controls
manualDecode.*         In-page Decode entry point
decode.*               Standalone local decode view
responseModal.*        Extension-origin Decode panel
fileProcessors/        Text, Office, PDF, image, and OCR processing
siteAdapters/          Shared editor handling and seven platform adapters
lib/                   Runtime dependencies and upstream licenses
scripts/package.py     Reproducible ZIP packaging
```

The published project excludes test suites, test documents, demo pages, development screenshots, caches, the separate website, and historical implementation notes. Packaging does not require npm or install dependencies.

## Build the distribution ZIP

From this repository folder, run with Python 3.9 or newer:

```sh
python scripts/package.py
```

This creates `dist/IDIA-BrowserExtension-v0.6.0.zip` and its `.sha256` checksum. The ZIP contains the runtime and documentation with `manifest.json` at its root. Extract it before using **Load unpacked**. Generated archives are excluded from Git.

Third-party versions and license locations are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). All bundled upstream license files are retained.

## Source availability

The source is published for transparency and inspection. **No additional open-source license is granted for the original IDIA code in this repository.** See [SOURCE_NOTICE.md](SOURCE_NOTICE.md). Third-party components retain their own licenses. Please do not describe this project as MIT-licensed or unrestricted open source.

Report reproducible issues through [GitHub Issues](https://github.com/eMErsOnW3/IDIA-DATA_PROTECTOR/issues), using synthetic examples and excluding private documents, credentials, or token mappings. If IDIA is useful to you, a star helps others discover the project.

## 中文说明

**在向 AI 分享内容前，先检查并保护敏感信息。**

IDIA 是一个本地运行的浏览器隐私插件。它会识别邮箱、部分国家/地区的电话号码、中国身份证号、美国社会保障号码、银行卡号模式、IPv4 地址和部分地址格式，由你选择需要保护的内容。

- **文本保护：** 将选中的敏感内容替换为当前对话专属的随机标记。未选中或未识别的信息仍会保留。
- **文件保护：** 支持 TXT、CSV、DOCX、XLSX、PDF、PNG、JPG、JPEG；生成保护后的副本，不修改磁盘上的原文件。
- **本地还原：** 点击页面右下角 **IDIA · Decode**，粘贴回复或选择文本/Office 文件，在当前浏览器会话内还原已知标记。
- **本地 OCR：** 随包提供英文、简体中文和日文模型。PDF、图片通过像素遮盖保护，不能还原。
- **平台适配：** 包含 ChatGPT、Gemini、Claude、DeepSeek、Copilot、Perplexity、Grok 的适配器。自动化模拟检查不代表全部平台的登录态真实页面都已验证。

### 安装与使用

1. 点击 GitHub **Code → Download ZIP**，下载后解压。
2. 打开 Chrome 的 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的文件夹。
4. 刷新已打开的 AI 页面，在插件弹窗中开启 **Enable protection**。
5. 输入内容后打开 **Review**，选择敏感项并点击 **Protect Selected**，检查结果后自行发送。
6. 上传文件时使用网站的文件选择器，在检查弹窗中选择 **Protect File**。网站可能随后自动上传保护后的副本。

**还原映射只保存在浏览器会话中。** 重启浏览器、清空 Session Vault、重新加载、更新或禁用插件会丢失映射。请在这些操作前完成需要的还原。不要把随机标记当成可永久恢复的加密备份。

检测和 OCR 可能漏检；插件不覆盖网站的所有上传方式，也不会清除 Office 文件中的所有元数据或嵌入内容。网页本身仍可能读取其输入框中的原文。发送前请检查保护结果。

该仓库公开源码供查看，**暂不为 IDIA 原创代码授予额外开源许可**；第三方依赖遵循各自许可证。运行不需要安装 Node.js 或构建依赖；需要重新打包时，在项目目录运行 `python scripts/package.py`。
