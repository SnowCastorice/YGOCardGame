#!/bin/bash
# Claude PreToolUse Hook：提交/推送前检查版本号和游戏日志
# 触发时机：Claude 执行 Bash 命令前
# 仅在 git commit / git push 命令时触发检查

input=$(cat)

# 提取 Bash 命令内容
command=$(echo "$input" | grep -o '"command": *"[^"]*"' | head -1 | sed 's/"command": *"//;s/"$//')
[ -z "$command" ] && exit 0

# 仅拦截 git push 和 git commit 命令
case "$command" in
  *"git push"*|*"git commit"*) ;;
  *) exit 0 ;;
esac

# 提取 cwd
cwd=$(echo "$input" | grep -o '"cwd": *"[^"]*"' | head -1 | sed 's/"cwd": *"//;s/"$//')
[ -z "$cwd" ] && exit 0
cd "$cwd" || exit 0

# === 提取四处版本号 ===
app_ver=$(grep -o "APP_VERSION = '[^']*'" index.html 2>/dev/null | head -1 | sed "s/APP_VERSION = '//;s/'//")
json_ver=$(grep -o '"version": "[^"]*"' data/changelog.json 2>/dev/null | head -1 | sed 's/"version": "//;s/"//')
md_ver=$(grep -m1 '^## v\?[0-9]' docs/CHANGELOG.md 2>/dev/null | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' | head -1)
readme_ver=$(grep -o 'version-v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' README.md 2>/dev/null | head -1 | sed 's/version-v//')

# === 检查一致性 ===
if [ "$app_ver" != "$json_ver" ] || [ "$app_ver" != "$md_ver" ] || [ "$app_ver" != "$readme_ver" ]; then
  printf "⚠️ 版本号不一致，请先修复再提交/推送：\n" >&2
  printf "  APP_VERSION=%s, changelog.json=%s, CHANGELOG.md=%s, README.md=%s\n" \
    "${app_ver:-空}" "${json_ver:-空}" "${md_ver:-空}" "${readme_ver:-空}" >&2
  exit 2
fi

# === 检查是否有代码变更但未更新版本号 ===
# 对比当前分支与远端的差异（覆盖合并进来的代码）
remote_branch=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)
if [ -n "$remote_branch" ]; then
  diff_files=$(git diff --name-only "$remote_branch"...HEAD 2>/dev/null)
else
  diff_files=$(git diff --name-only HEAD~1 2>/dev/null)
fi

# 也包含未提交的变更
unstaged=$(git diff --name-only 2>/dev/null)
staged=$(git diff --cached --name-only 2>/dev/null)
all_files=$(printf "%s\n%s\n%s" "$diff_files" "$unstaged" "$staged" | sort -u)

[ -z "$all_files" ] && exit 0

# 检查是否存在需要版本号更新的代码变更
code_changed=false
while IFS= read -r file; do
  case "$file" in
    .claude/*|.agents/*|skills-lock.json) continue ;;
    docs/*|data/changelog.json) continue ;;
    data/ocg/prices/*) continue ;;
    tools/*) continue ;;
    CloudflareReport/*) continue ;;
    .gitignore|.mcp.json|CLAUDE.md|README.md) continue ;;
    screenshots/*|test_output/*|pack_references/*) continue ;;
    "") continue ;;
    *) code_changed=true; break ;;
  esac
done <<< "$all_files"

if [ "$code_changed" = true ]; then
  # 检查版本号是否相比远端有递增
  if [ -n "$remote_branch" ]; then
    remote_ver=$(git show "$remote_branch":index.html 2>/dev/null | grep -o "APP_VERSION = '[^']*'" | head -1 | sed "s/APP_VERSION = '//;s/'//")
    if [ "$app_ver" = "$remote_ver" ]; then
      printf "⚠️ 检测到代码变更但版本号未递增（当前 v%s = 远端 v%s）\n" "$app_ver" "$remote_ver" >&2
      printf "请确认是否需要更新版本号和游戏日志（changelog.json + CHANGELOG.md）\n" >&2
      exit 2
    fi
  fi
fi

exit 0
