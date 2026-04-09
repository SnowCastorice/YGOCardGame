#!/bin/bash
# Auto-generate diary entry before Claude Code compacts conversation
# This hook runs automatically before compact operations (natural session checkpoints)
# 日记保存在项目级 .claude/memory/diary/ 下

echo "📝 Auto-generating diary entry before compact..."
echo "/diary"
