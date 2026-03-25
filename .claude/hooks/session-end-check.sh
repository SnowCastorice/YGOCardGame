#!/bin/bash
# 会话结束前自动检查：CHANGELOG 同步 + changelog.json 同步 + 版本号一致性
# 对应 CLAUDE.md 中的三条会话结束 Hooks，合并为一个 Stop hook 脚本

input=$(cat)

# 从 JSON 中提取 cwd（纯 bash，不依赖 jq）
cwd=$(echo "$input" | grep -o '"cwd": *"[^"]*"' | head -1 | sed 's/"cwd": *"//;s/"$//')
[ -z "$cwd" ] && exit 0
cd "$cwd" || exit 0

problems=""

# === 检测是否有代码/文档变更（排除 CHANGELOG 相关文件自身） ===
code_changed=false
changed_files=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
if [ -n "$changed_files" ]; then
  other_changes=$(echo "$changed_files" | grep -v '^docs/CHANGELOG.md$' | grep -v '^data/changelog.json$' | grep -v '^DEVELOPMENT.md$' | grep -v '^\.claude/' | grep -v '^\.agents/' | grep -v '^skills-lock\.json$' | head -1)
  [ -n "$other_changes" ] && code_changed=true
fi

# === Hook 1: CHANGELOG 同步 ===
if [ "$code_changed" = true ]; then
  changelog_modified=$(echo "$changed_files" | grep -c '^docs/CHANGELOG.md$')
  if [ "$changelog_modified" -eq 0 ]; then
    problems="${problems}- Hook 1: 检测到代码/文档变更，但 docs/CHANGELOG.md 未更新\n"
  fi
fi

# === Hook 2 & 3: 版本号一致性检查 ===
app_version=$(grep -o "APP_VERSION = '[^']*'" index.html 2>/dev/null | head -1 | sed "s/APP_VERSION = '//;s/'//")
json_version=$(grep -o '"version": "[^"]*"' data/changelog.json 2>/dev/null | head -1 | sed 's/"version": "//;s/"//')
md_version=$(grep -m1 '^## v\?[0-9]' docs/CHANGELOG.md 2>/dev/null | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' | head -1)

if [ -n "$app_version" ] && [ -n "$json_version" ] && [ -n "$md_version" ]; then
  if [ "$app_version" != "$json_version" ] || [ "$app_version" != "$md_version" ]; then
    problems="${problems}- Hook 2/3: 版本号不一致 — APP_VERSION=${app_version}, changelog.json=${json_version}, CHANGELOG.md=${md_version}\n"
  fi
fi

# === 输出结果 ===
if [ -n "$problems" ]; then
  printf "会话结束前检查未通过，请先修复：\n${problems}" >&2
  exit 2
fi

exit 0
