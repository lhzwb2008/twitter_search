#!/bin/bash

# AI产品Twitter搜索工具停止脚本

echo "🛑 停止AI产品Twitter搜索工具"
echo "=========================="

# 查找运行中的进程
PIDS=$(pgrep -f "python3 app.py")

if [ -z "$PIDS" ]; then
    echo "ℹ️  没有找到运行中的应用进程"
    exit 0
fi

echo "🔍 找到以下运行中的进程："
echo "$PIDS" | while read pid; do
    echo "   PID: $pid"
done

echo ""
read -p "确认停止这些进程？(Y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "❌ 操作已取消"
    exit 0
fi

# 停止进程
echo "🛑 正在停止进程..."
pkill -f "python3 app.py"

# 等待进程结束
sleep 2

# 验证是否成功停止
REMAINING=$(pgrep -f "python3 app.py")
if [ -z "$REMAINING" ]; then
    echo "✅ 应用已成功停止"
else
    echo "⚠️  仍有进程在运行，尝试强制停止..."
    pkill -9 -f "python3 app.py"
    sleep 1
    
    FINAL_CHECK=$(pgrep -f "python3 app.py")
    if [ -z "$FINAL_CHECK" ]; then
        echo "✅ 应用已强制停止"
    else
        echo "❌ 无法停止应用，请手动处理"
    fi
fi 