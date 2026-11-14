# 搜索推荐词后端路由

新接口以 `/socialdatax/api` 为统一前缀，接口的业务路径如下：

- `POST /v1/feishu/search/suggestions`
- `GET /v1/feishu/profile-fetch/table-output-configs`
- `PUT /v1/feishu/profile-fetch/table-output-config`
- `GET /v1/feishu/xhs_download_proxy`
- `POST /v1/feishu/post/list`

推荐词请求和表格输出配置使用新后端，保留 `plugin_type=search_suggestions`。推荐词结果仍按现有流程写入，停止及同页继续写入行为不变；共用数据模块中的附件下载代理和作品结果读取也切换到新前缀。

## 域名与构建

| 环境 | 新接口基址 | 原接口基址 |
| --- | --- | --- |
| 生产 | `https://api.socialdatax.com` | `https://api.52choujiang.cn` |
| 测试 | `https://test-lotto.weiyoubot.cn` | 沿用该环境的 `VITE_API_BASE_URL` |
| 本地开发 | `/`，由 Vite 的 `/socialdatax/api` 代理到测试服 | 沿用 `/social/api` 代理 |

生产构建在 `.env.production` 中分别配置 `VITE_FEISHU_API_BASE_URL` 和 `VITE_API_BASE_URL`；用户 API Key 由插件输入，不能写入环境变量或产物。源码与 `dist/` 一起提交。构建完成后才更新插件发布版本：

```sh
npm test
npm run build
```

GitLab 同步会从内部同步根目录的 `.env.development-prod`，统一 `dev:prod` 的新旧生产代理；其他环境文件（包括 `.env.production` 和所有本地覆盖文件）继续保留 GitHub 现状。同步也包含内部已经构建好的 `dist/`。直接使用该产物无需再次设置变量；若在 GitHub 或本地重新构建，须显式提供两个基址，或在该仓库的生产环境文件中配置：

```sh
VITE_API_BASE_URL=https://api.52choujiang.cn \
VITE_FEISHU_API_BASE_URL=https://api.socialdatax.com npm run build
```

更改环境变量后需要重新构建或重启 Vite。已有表结构、映射和版本参数沿用现有契约。自动化测试使用 SDK 与 HTTP 边界替身；真实飞书侧栏的采集、停止和写表仍需发布后实测。
