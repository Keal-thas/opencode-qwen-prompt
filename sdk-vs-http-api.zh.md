# OpenCode: SDK vs 直接调用 HTTP API

> 调研时间:2026-09-11
> 调研对象:`anomalyco/opencode` 仓库 `dev` 分支
> 方法:拉取仓库中生成的 `packages/sdk/js/src/gen/sdk.gen.ts` 与 `packages/sdk/openapi.json`,
> 用脚本做端点级比对,而非单纯阅读文档.

## 结论(TL;DR)

**优先用 `@opencode-ai/sdk`,缺失的端点用 HTTP 直调兜底.**

- SDK 由 `@hey-api/openapi-ts` 从 server 的 OpenAPI spec **自动生成**,覆盖了绝大多数常用端点(session,files,tui,mcp,provider 等),并带完整的 TypeScript 类型推断(请求参数,响应结构,错误类型全部有类型).
- 但生成过程 + 文档维护存在滞后/疏漏,**约 111 个"经典"v1 端点中有 ~28 个没有被包装成便捷方法**,需要绕开 SDK,直接对 HTTP API 发请求(可以用 SDK 自带的底层 `client.request()` 或裸 `fetch`).
- 官方文档页(opencode.ai/docs/sdk)本身也不完整,比如 `config.update()`(PATCH /config)代码里其实有,但文档没写——**光看文档不可靠,最好直接翻生成的源码 / 自己拉 OpenAPI spec 核对**.

## 为什么不是"纯 HTTP" 或"纯 SDK"

| | 纯 HTTP 直调 | 纯 SDK | SDK + HTTP 兜底(推荐) |
|---|---|---|---|
| 类型推断 | 无,需要自己手写类型 | 有(自动生成) | 覆盖到的部分有,缺口部分自己补类型 |
| 覆盖端点 | 100%(只要 server 有就能调) | ~75%(经典端点里约缺 1/4) | 100% |
| 维护成本 | 高(升级要自己跟 API 变化) | 低(升级 npm 包自动同步) | 中等,只需关注缺口列表是否有更新 |
| 出错概率 | 高(拼错 URL/参数不会报编译错误) | 低 | 对覆盖到的部分低,兜底部分需要自己小心 |

## 已确认的 SDK 缺口清单(dev 分支实测,非文档推测)

以下端点在 OpenAPI spec 里存在,但在 `sdk.gen.ts` 里**没有**对应的类型安全方法:

### 完全没有对应模块

| HTTP | 路径 | 说明 |
|---|---|---|
| GET | `/question` | 列出所有 session 里待处理的"提问请求"(AI 主动向用户提问的场景) |
| POST | `/question/{requestID}/reject` | 拒绝一个提问请求 |
| POST | `/question/{requestID}/reply` | 回答一个提问请求 |
| POST | `/sync/history` | 增量拉取同步事件(多 workspace 间事件溯源同步机制,偏内部用途) |
| POST | `/sync/replay` | 重放一段完整同步事件历史 |
| POST | `/sync/start` | 启动 workspace 同步循环 |
| POST | `/sync/steal` | 把一个 session 转移到当前 workspace |
| GET | `/skill` | 列出系统里所有可用的 skill |
| DELETE | `/session/{sessionID}/message/{messageID}/part/{partID}` | 删除消息里的某个 part |
| PATCH | `/session/{sessionID}/message/{messageID}/part/{partID}` | 更新消息里的某个 part |
| GET | `/permission` | 列出**所有 session** 里当前待处理的权限请求(全局汇总版) |
| POST | `/permission/{requestID}/reply` | 批准/拒绝权限请求(全局版;session 内版本 SDK 有) |

### 已有模块但漏了部分方法

| 模块 | SDK 已有方法 | 缺失方法 |
|---|---|---|
| `client.global` | `.event()` | `config.get/update`,`dispose`,`health`,`upgrade` |
| `client.vcs` | `.get()` | `apply`,`diff`,`diff/raw`,`status` |
| `client.project` | `.list()`,`.current()` | `initGit`,`update`,`directories` |
| `client.pty` | list/create/remove/get/update/connect | `shells`,`connectToken` |
| `client.tui` | 多数已有 | `selectSession` |
| `client.session` | 绝大多数已有 | `deleteMessage`(永久删除消息) |
| `client.auth` | `.set()` | `.remove()` —— **命名冲突 bug**:`/mcp/{name}/auth` 相关方法占用了 `Auth` class 的 `.remove()`,导致真正的顶层 `DELETE /auth/{providerID}` 完全没有方法可调 |

### 已确认存在,只是文档没写的(不算缺口)

- `config.update()`(PATCH /config)—— 代码里有,`opencode.ai/docs/sdk` 文档页漏写了.
- `session` 内响应权限请求 —— 代码里有,只是生成器给起了个很丑的名字:`client.postSessionIdPermissionsPermissionId()`.

### 特意排除在外,不算缺口

- `/experimental/*` 下的端点(如 worktree 相关):从官方 TUI 自身代码看,这些是故意不包装,让内部代码直接裸 `fetch(url)` 调用的,设计如此,不是疏漏.

## 实践建议

1. 日常业务优先用 `@opencode-ai/sdk`,享受类型推断和自动补全.
2. 遇到上表里的缺口端点,直接用 SDK 暴露的底层 client(一般是 `createOpencodeClient` 返回对象上的 `.request()` 或自定义 `fetch`)手动拼 URL 调用,注意:
   - 自己维护好请求体/响应体的 TS 类型(可以参考 `types.gen.ts` 里对应 `XxxData`/`XxxResponses` 的结构,虽然没导出方法,但类型定义往往还在).
   - 关注 opencode 仓库更新,这些缺口可能随时被后续 PR 补上.
3. 如果是要做"全局权限审批面板"之类需要跨 session 汇总的功能,必须走 HTTP 兜底(`GET /permission` + `POST /permission/{requestID}/reply`).
4. `auth.remove` 这种命名冲突导致的功能缺失,建议直接给官方提 issue,附上这次调研的对比脚本/结论.

---

*本文档基于对 `anomalyco/opencode` 仓库 `dev` 分支源码的实测比对生成,随仓库更新可能过时,建议核对时以你实际安装的 npm 包版本 + 对应 tag 下的 `openapi.json` 为准.*
