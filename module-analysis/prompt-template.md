# Module analysis prompt template

Used by `analyze-modules.sh` to drive an unattended, per-directory pass
over a large single-module monolith (many `Controller`/`Service`/etc.
subdirectories) to build up an architecture map for someone unfamiliar
with the system.

Placeholders: `{{MODULE_PATH}}`, `{{MODULE_NAME}}`, `{{OUT_FILE}}` —
substituted by the calling script.

## Design notes

The failure mode this template is built around: on messy/legacy code,
a model asked to "explain the business logic" will confidently
fabricate a plausible-sounding explanation for code whose actual
intent isn't recoverable from the file alone. Formatting instructions
alone don't fix that — the fix is forcing every claim to carry a
`file:line` citation and an explicit confidence marker, so an
ungrounded answer is visibly flagged rather than indistinguishable
from a grounded one. Anything without evidence must be written as
"意图不明，需人工确认" (or the English equivalent), never smoothed
over into a made-up explanation.

## The prompt

```
你在分析一个大型单体项目的一个业务模块，目的是帮助不熟悉这个系统的人建立可信的整体认知。

目标模块目录：{{MODULE_PATH}}

## 铁律
- 每一条结论必须标注证据来源：`文件路径:行号`。没有证据支撑的结论一律标记为 [推测]，绝不能把推测当事实写。
- 遇到看不懂意图的代码（没注释、命名不清），直接写"意图不明，需人工确认"，不要编一个"合理的"解释。
- 不要修改任何代码，只读分析。

## 分析步骤
1. 列出该目录下所有文件及其角色（Controller/Service/Mapper/DTO/Config 等）。
2. 对每个 Controller 端点，用表格列出：路径 | HTTP方法 | 入参 | 出参 | 一句话业务用途 | 证据(file:line)
3. 对 Service 层核心逻辑，找出所有条件分支（if/switch/策略模式等），用表格列出：分支条件 | 触发场景 | 对应行为 | 证据(file:line) | 置信度(高/中/低，低于中的要写为什么不确定)
4. 依赖关系：
   - 向外依赖：本模块调用了哪些其他模块的类/方法（grep import + 调用点），列出 目标模块 | 被调用的类/方法 | 调用位置(file:line)
   - 反向依赖：在其他模块目录里 grep 是否有代码 import/调用了本模块的类，同样列出证据。找不到就写"未检索到调用方，可能是入口模块或检索范围不足"，不要写"应该没有人依赖"。
5. 代码质量/存疑点：只列有具体证据支撑的问题（比如"这个 if 分支和第40行的分支条件重复，可能是历史遗留"），不要泛泛而谈"代码质量差"。

## 输出格式
Markdown，保存到 {{OUT_FILE}}：

## 模块概述
（2-3句话，基于步骤1-2的证据）
## 对外接口
（步骤2的表格）
## 核心业务逻辑
（步骤3的表格）
## 依赖关系
### 对外调用
### 被谁调用
## 代码质量/存疑点
### 已确认问题
### 意图不明，需人工确认

如果某一节因为代码本身信息不足而无法填写，直接写"信息不足，无法分析"，不要为了填满表格而编内容。
```
