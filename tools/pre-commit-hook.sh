#!/bin/bash
# Git pre-commit Hook：提交前自动检查
# 1. 版本号一致性检查
# 2. 数据一致性检查
#
# 安装方式（每台设备需执行一次）：
#   cp tools/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

# === 版本号检查 ===
bash tools/version-check.sh
version_rc=$?
if [ $version_rc -ne 0 ]; then
    exit $version_rc
fi

# === 数据一致性检查（仅在数据相关文件变更时触发） ===
staged_files=$(git diff --cached --name-only 2>/dev/null)
data_changed=false
while IFS= read -r file; do
  case "$file" in
    data/ocg/*|tools/rebuild_image_maps.py) data_changed=true; break ;;
  esac
done <<< "$staged_files"

if [ "$data_changed" = true ]; then
    echo ""
    echo "📋 检测到数据文件变更，运行数据一致性检查..."
    # 优先使用项目虚拟环境，否则用系统 python
    if [ -x "local/venv/Scripts/python.exe" ]; then
        PYTHON="local/venv/Scripts/python.exe"
    elif command -v python3 &>/dev/null; then
        PYTHON="python3"
    else
        PYTHON="python"
    fi
    PYTHONIOENCODING=utf-8 "$PYTHON" tools/check_data_consistency.py
    data_rc=$?
    if [ $data_rc -ne 0 ]; then
        echo ""
        echo "❌ 数据一致性检查未通过，提交被阻止！"
        echo "如需跳过检查：git commit --no-verify"
        exit 1
    fi
fi

exit 0
