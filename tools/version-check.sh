#!/bin/bash
# Git pre-commit Hook：版本号一致性兜底检查
# 触发时机：git commit 之前
# 检查 APP_VERSION、changelog.json、CHANGELOG.md 三处版本号是否一致
#
# 安装方式（每台设备需执行一次）：
#   cp tools/version-check.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
# 或：
#   echo '#!/bin/bash' > .git/hooks/pre-commit
#   echo 'exec bash tools/version-check.sh' >> .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

# === 检测暂存区是否有需要版本号更新的文件 ===
staged_files=$(git diff --cached --name-only 2>/dev/null)
[ -z "$staged_files" ] && exit 0

code_changed=false
while IFS= read -r file; do
  case "$file" in
    .claude/*|.agents/*|skills-lock.json) continue ;;
    docs/CHANGELOG.md|data/changelog.json|DEVELOPMENT.md) continue ;;
    docs/SETUP.md|docs/TODO.md|docs/TOOLS.md) continue ;;
    data/ocg/prices/*) continue ;;
    tools/*) continue ;;
    CloudflareReport/*) continue ;;
    .gitignore|.mcp.json|CLAUDE.md|README.md) continue ;;
    screenshots/*|test_output/*) continue ;;
    "") continue ;;
    *) code_changed=true; break ;;
  esac
done <<< "$staged_files"

[ "$code_changed" = false ] && exit 0

# === 提取三处版本号 ===
app_ver=$(grep -o "APP_VERSION = '[^']*'" index.html 2>/dev/null | head -1 | sed "s/APP_VERSION = '//;s/'//")
json_ver=$(grep -o '"version": "[^"]*"' data/changelog.json 2>/dev/null | head -1 | sed 's/"version": "//;s/"//')
md_ver=$(grep -m1 '^## v\?[0-9]' docs/CHANGELOG.md 2>/dev/null | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' | head -1)

# === 检查一致性 ===
if [ -z "$app_ver" ] || [ -z "$json_ver" ] || [ -z "$md_ver" ]; then
  echo "❌ 版本号提取失败 — APP_VERSION=${app_ver:-空}, changelog.json=${json_ver:-空}, CHANGELOG.md=${md_ver:-空}"
  echo "请检查文件格式是否正确。"
  exit 1
fi

if [ "$app_ver" != "$json_ver" ] || [ "$app_ver" != "$md_ver" ]; then
  echo "❌ 版本号不一致，提交被阻止！"
  echo ""
  echo "  APP_VERSION (index.html):    ${app_ver}"
  echo "  changelog.json:              ${json_ver}"
  echo "  CHANGELOG.md:                ${md_ver}"
  echo ""
  echo "请确保三处版本号一致，并编写对应的更新日志后重新提交。"
  echo "如需跳过检查：git commit --no-verify"
  exit 1
fi

exit 0
