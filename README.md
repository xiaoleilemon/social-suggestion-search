# 搜索推荐词 · Social Suggestion Search

从 SocialDataBridge 的“搜索推荐词”功能拆分的独立飞书多维表格扩展。输入关键词后，获取各社交平台的搜索推荐词，并把结果写入多维表格。

## 功能

- 支持小红书、抖音、TikTok、快手、哔哩哔哩、微博、好看视频、今日头条、百度贴吧、知乎、X、YouTube，具体可用能力由现有后端提供。
- 批量关键词支持换行或中英文逗号分隔，去重后依次获取推荐词。
- 新建结果表，或写入现有表；现有表支持自选字段和自定义字段映射。
- 支持搜索关键词、推荐词、建议类型、建议标记、补充说明、平台、提取时间等输出字段。
- API Key 通过飞书 SDK bridge 保存；保存期间不能启动任务，执行及待恢复写入期间不能修改密钥，完成或结束本次写入后可修改。

写入失败会显示错误，不会自动切换到其他表。仅在返回的写入记录数与结果数一致时显示处理完成；字段映射失效或字段类型不兼容时停止写入，避免漏写后提示成功。

同一插件页面中，分批失败后保留本次结果、目标表和已确认写入条数，点击“继续写入”只处理剩余部分，不重新搜索或重复追加已完成批次。完成后再次执行仍是一次新的追加。“结束本次写入”会丢弃当前页面的剩余结果，已写入记录保留；关闭或刷新插件页面也会清除这份临时进度。

批次响应超时后，继续写入会先分页核对目标表：排除本次执行前及已确认批次的记录，按原映射字段的内容和数量识别失败批次已落表的结果，只补缺失部分。核对读取失败、核对所需字段被替换或出现多于预期的相同新记录时会停止，避免未经确认就再次追加。

## 安装与启动

已在 Node.js 18.17.0 验证通过。Element Plus 固定为 `2.13.7`，与 `social-data-bridge` 保持一致。

```sh
npm ci
npm run dev
```

本地地址通常是 `http://localhost:5173/`，以终端输出为准。源码、依赖和环境配置均在本仓库内，不依赖原 SocialDataBridge 仓库。

此项目依赖飞书宿主提供的表格 API。普通浏览器可以访问静态界面；保存密钥、选择表格和写入结果需要在多维表格扩展中调试。将本地开发地址配置为扩展的调试地址，参见[多维表格扩展脚本开发指南](https://feishu.feishu.cn/docx/U3wodO5eqome3uxFAC3cl0qanIe)。

## 使用

1. 在多维表格中打开扩展，填写并保存 API Key，可从界面中的链接获取密钥。
2. 选择平台，输入一个或多个搜索关键词。
3. 选择新建表格或现有表格，设置需要的字段；使用现有表时可配置字段映射。
4. 点击“立即执行”，等待推荐词写入多维表格。

API Key、字段选择等设置通过飞书 SDK bridge 保存。结果写入当前多维表格。

## 接口环境

本项目使用已有后端，不附带后端服务，继续调用 `/social/api/v1/feishu/search/suggestions`，并保留 `plugin_type=search_suggestions` 的表格输出配置协议。

| 命令／模式 | 接口配置 |
| --- | --- |
| `npm run dev` | `.env.development`；`/social/api` 通过 Vite 代理到测试后端 |
| `npm run dev:prod` | `.env.development-prod`；本地开发时通过 Vite 代理到生产后端 |
| `npm run build:test` | `.env.test`；`https://test-lotto.weiyoubot.cn` |
| `npm run build` / `npm run build:prod` | `.env.production`；`https://api.52choujiang.cn` |

开发代理目标由 `VITE_DEV_PROXY_TARGET` 控制。默认覆盖测试地址；临时改为其他后端时，可建立被 Git 忽略的 `.env.development.local` 并设置该变量，无需修改 `vite.config.js`。

## 验证

```sh
npm test
```

测试使用模拟的飞书 SDK 边界，验证推荐词字段、新建表、现有表字段映射、类型校验和请求版本参数，不调用真实采集服务或修改用户表格。

真实端到端验收需要在飞书中使用有效 API Key，分别验证新建表格和现有表格写入。

## 构建与发布

只有准备发布时才生成生产产物：

```sh
npm run build:prod
npm run preview
```

生成目录为 `dist/`，预览端口为 `4173`。提交或部署前，确保 `dist/` 与当前源码对应。

按飞书扩展发布流程提交产物；原模板提供的[发布表单](https://feishu.feishu.cn/share/base/form/shrcnGFgOOsFGew3SDZHPhzkM0e)可作为发布参考。
