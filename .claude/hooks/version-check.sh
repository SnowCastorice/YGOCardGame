#!/bin/bash
# Claude Stop Hook：版本号一致性检查
# 触发时机：Claude 每次回复结束时
# 检查 APP_VERSION、changelog.json、CHANGELOG.md、README.md 四处版本号是否一致

input=$(cat)

# 从 JSON 中提取 cwd
cwd=$(echo "$input" | grep -o '"cwd": *"[^"]*"' | head -1 | sed 's/"cwd": *"//;s/"$//')
[ -z "$cwd" ] && exit 0
cd "$cwd" || exit 0

# === 检测是否有需要版本号更新的文件变更 ===
changed_files=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
[ -z "$changed_files" ] && exit 0

# 排除不需要版本号更新的文件
code_changed=false
while IFS= read -r file; do
  case "$file" in
    .claude/*|.agents/*|skills-lock.json) continue ;;
    docs/CHANGELOG.md|data/changelog.json) continue ;;
    docs/SETUP.md|docs/TODO.md|docs/TOOLS.md) continue ;;
    data/ocg/prices/*) continue ;;
    tools/*) continue ;;
    admin/*) continue ;;
    CloudflareReport/*) continue ;;
    .gitignore|.mcp.json|CLAUDE.md|README.md) continue ;;
    screenshots/*|test_output/*) continue ;;
    "") continue ;;
    *) code_changed=true; break ;;
  esac
done <<< "$changed_files"

[ "$code_changed" = false ] && exit 0

# === 提取四处版本号 ===
app_ver=$(grep -o "APP_VERSION = '[^']*'" index.html 2>/dev/null | head -1 | sed "s/APP_VERSION = '//;s/'//")
json_ver=$(grep -o '"version": "[^"]*"' data/changelog.json 2>/dev/null | head -1 | sed 's/"version": "//;s/"//')
md_ver=$(grep -m1 '^## v\?[0-9]' docs/CHANGELOG.md 2>/dev/null | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' | head -1)
readme_ver=$(grep -o 'version-v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' README.md 2>/dev/null | head -1 | sed 's/version-v//')

# === 检查一致性 ===
problems=""

if [ -z "$app_ver" ] || [ -z "$json_ver" ] || [ -z "$md_ver" ] || [ -z "$readme_ver" ]; then
  problems="版本号提取失败 — APP_VERSION=${app_ver:-空}, changelog.json=${json_ver:-空}, CHANGELOG.md=${md_ver:-空}, README.md=${readme_ver:-空}"
elif [ "$app_ver" != "$json_ver" ] || [ "$app_ver" != "$md_ver" ] || [ "$app_ver" != "$readme_ver" ]; then
  problems="版本号不一致 — APP_VERSION=${app_ver}, changelog.json=${json_ver}, CHANGELOG.md=${md_ver}, README.md=${readme_ver}"
fi

if [ -n "$problems" ]; then
  printf "⚠️ 版本号检查未通过：%s\n请确保四处版本号一致，并编写对应的更新日志。\n" "$problems" >&2
  exit 2
fi

exit 0
