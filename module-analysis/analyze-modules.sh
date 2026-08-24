#!/usr/bin/env bash
# Unattended, concurrency-limited, resumable per-module analysis runner.
#
# Iterates every immediate subdirectory of MODULES_DIR, and for each one
# runs a read-only opencode agent to produce a module-analysis doc using
# the template in prompt-template.md. Safe to interrupt and re-run: any
# module that already has a non-empty output file is skipped.
#
# Usage:
#   MODULES_DIR=/path/to/project/src/modules \
#   OUT_DIR=/path/to/project/docs/module-analysis \
#   ./analyze-modules.sh
#
# Tune CONCURRENCY down if the shared vLLM server starts queuing/slowing
# down under load; there's no hard reason to keep it low otherwise since
# total wall time isn't a constraint (each module run is independent).

set -euo pipefail

MODULES_DIR="${MODULES_DIR:?set MODULES_DIR to the directory containing one subdirectory per module}"
OUT_DIR="${OUT_DIR:?set OUT_DIR to where the analysis .md files should be written}"
LOG_DIR="${LOG_DIR:-$OUT_DIR/../logs/module-analysis}"
CONCURRENCY="${CONCURRENCY:-2}"
AGENT="${AGENT:-explore}"  # read-only agent — can't modify code even if the prompt fails to constrain it

mkdir -p "$OUT_DIR" "$LOG_DIR"

analyze_one() {
  local module_dir="$1"
  local module_name
  module_name=$(basename "$module_dir")
  local out_file="$OUT_DIR/${module_name}.md"
  local log_file="$LOG_DIR/${module_name}.log"

  if [[ -s "$out_file" ]]; then
    echo "[skip] $module_name already analyzed"
    return 0
  fi

  local prompt
  prompt=$(cat <<EOF
你在分析一个大型单体项目的一个业务模块，目的是帮助不熟悉这个系统的人建立可信的整体认知。

目标模块目录：${module_dir}

## 铁律
- 每一条结论必须标注证据来源：文件路径:行号。没有证据支撑的结论一律标记为 [推测]，绝不能把推测当事实写。
- 遇到看不懂意图的代码（没注释、命名不清），直接写"意图不明，需人工确认"，不要编一个"合理的"解释。
- 不要修改任何代码，只读分析。

## 分析步骤
1. 列出该目录下所有文件及其角色（Controller/Service/Mapper/DTO/Config 等）。
2. 对每个 Controller 端点，用表格列出：路径 | HTTP方法 | 入参 | 出参 | 一句话业务用途 | 证据(file:line)
3. 对 Service 层核心逻辑，找出所有条件分支（if/switch/策略模式等），用表格列出：分支条件 | 触发场景 | 对应行为 | 证据(file:line) | 置信度(高/中/低，低于中的要写为什么不确定)
4. 依赖关系：
   - 向外依赖：本模块调用了哪些其他模块的类/方法（grep import + 调用点），列出 目标模块 | 被调用的类/方法 | 调用位置(file:line)
   - 反向依赖：在其他模块目录里 grep 是否有代码 import/调用了本模块的类，同样列出证据。找不到就写"未检索到调用方，可能是入口模块或检索范围不足"，不要写"应该没有人依赖"。
5. 代码质量/存疑点：只列有具体证据支撑的问题，不要泛泛而谈"代码质量差"。

## 输出格式
Markdown，保存到 ${out_file}：

## 模块概述
## 对外接口
## 核心业务逻辑
## 依赖关系
### 对外调用
### 被谁调用
## 代码质量/存疑点
### 已确认问题
### 意图不明，需人工确认

如果某一节因为代码本身信息不足而无法填写，直接写"信息不足，无法分析"，不要为了填满表格而编内容。
EOF
)

  echo "[start] $module_name"
  if opencode run --agent "$AGENT" "$prompt" > "$log_file" 2>&1; then
    echo "[done] $module_name"
  else
    echo "[FAIL] $module_name (see $log_file)"
  fi
}

export -f analyze_one
export OUT_DIR LOG_DIR AGENT

find "$MODULES_DIR" -mindepth 1 -maxdepth 1 -type d \
  | xargs -P "$CONCURRENCY" -I{} bash -c 'analyze_one "$@"' _ {}

total=$(find "$MODULES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
done_count=$(find "$OUT_DIR" -maxdepth 1 -name '*.md' -size +0c | wc -l)
echo "进度: ${done_count} / ${total}，结果在 $OUT_DIR"
