# ClipNest

> 粘贴分享文案，自动识别链接，保存视频或图文作品。

一个移动端优先、可自托管的链接收藏工具。无账号、无数据库、无持久化存储。

![Build](https://github.com/ikun5200/clipnest/actions/workflows/docker.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)
![License](https://img.shields.io/badge/license-MIT-blue)

## 功能

- 自动从分享文案中提取链接，支持短链、作品页链接和纯作品 ID
- 视频：原画 / 1080P / 720P / 540P 等可用画质（以源站实际提供为准）
- 图文：缩略图预览、多选、单张下载、ZIP 全部下载
- 移动端优先：触控友好、安全区适配、暖色 Claude 风格界面
- 服务端代理下载：避免跨域与 Referer 限制
- 内置超时、重试、限流与媒体域名白名单
- Docker 一键部署，GitHub Actions 自动构建镜像

## 快速开始

### Docker

```bash
docker build -t clipnest .
docker run -d --name clipnest -p 3000:3000 --restart unless-stopped clipnest
```

或者：

```bash
docker compose up -d --build
```

打开 <http://localhost:3000>。

### 从 GHCR 拉取

CI 会在推送到 `main` 时构建并发布镜像：

```bash
docker pull ghcr.io/ikun5200/clipnest:latest
docker run -d --name clipnest -p 3000:3000 --restart unless-stopped ghcr.io/ikun5200/clipnest:latest
```

> 如果 GHCR 包是私有的，请先执行 `docker login ghcr.io`。

## 本地开发

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>
- API：<http://localhost:3000>
- Vite 会把 `/api` 代理到本地 API。

生产模式：

```bash
npm run build
npm start
```

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `TRUST_PROXY` | 未设置 | 放在反向代理后面时设为 `1`，用于正确获取客户端 IP |

## 工作方式

1. 从粘贴的文本中提取受支持的链接。
2. 短链接通过 302 展开为作品 ID。
3. 服务端请求公开的作品详情，归一化为画质、图片和统计信息。
4. 下载时由服务端流式代理源站媒体，浏览器直接保存。

服务端不落盘存储媒体文件，不维护用户账号，也不记录下载历史。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/parse` | 请求体 `{ "text": "分享文案或链接" }` |
| `GET` | `/api/download/video?id=&quality=` | `quality` 为 `original` 或 `gear-N` |
| `GET` | `/api/download/image?id=&index=` | 下载单张图片 |
| `GET` | `/api/download/images?id=&indices=0,1,2` | 打包下载；省略 `indices` 表示全部 |
| `GET` | `/api/health` | 健康检查 |

API 供内置前端使用，未提供鉴权。若公开部署，建议在反向代理层增加访问控制。

## 安全与隐私

- 只允许访问白名单内的媒体域名，避免把服务变成任意 URL 代理。
- 所有上游请求都有超时和重试上限。
- 解析和下载接口带基础限流。
- 不收集、不上传、不持久化用户的分享文案与下载内容。
- 剪贴板读取需要 HTTPS 或 localhost；HTTP 部署时请手动粘贴。

## 使用须知 / Disclaimer

- 本项目仅用于个人备份你本人拥有版权，或已获得权利人明确授权的内容。
- 本项目不存储、不托管、不镜像、不分发任何第三方内容。所有解析与下载均由用户主动发起，媒体文件从源站直接流向用户浏览器。
- 本项目不提供绕过登录、付费、访问控制或地域限制的能力，仅处理公开分享链接中已经下发的媒体地址。
- 请遵守源平台的服务条款、robots 规则以及你所在地区的法律法规。禁止将本项目用于批量抓取、商业分发、侵权或其他违法用途。
- 本项目与任何内容平台均无关联，也未获得任何平台的授权、认可或赞助。
- 软件按“现状”提供，不提供任何明示或暗示的担保；因使用本项目产生的风险与责任由使用者自行承担。
- 如果你是权利人，认为本项目被用于侵犯你的权益，请通过仓库 Issue 联系维护者。

## License

[MIT](./LICENSE)

> 许可证仅覆盖本仓库的代码，不覆盖任何第三方内容或商标。
