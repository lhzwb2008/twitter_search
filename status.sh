#!/bin/bash

# AI产品Twitter搜索工具状态检查脚本

echo "📊 AI产品Twitter搜索工具状态"
echo "=========================="

# 检查进程状态
PIDS=$(pgrep -f "python3 app.py")

if [ -z "$PIDS" ]; then
    echo "🔴 应用未运行"
    echo ""
    echo "💡 启动应用: ./run.sh"
    exit 1
fi

echo "🟢 应用正在运行"
echo "🔍 运行中的进程："
echo "$PIDS" | while read pid; do
    echo "   PID: $pid"
    # 显示进程详细信息
    ps -p $pid -o pid,ppid,cmd,etime,pcpu,pmem 2>/dev/null | tail -n +2 | while read line; do
        echo "   详情: $line"
    done
done

echo ""
echo "📍 访问地址: http://localhost:3000"

# 检查端口占用
if command -v lsof &> /dev/null; then
    PORT_INFO=$(lsof -i :3000 2>/dev/null)
    if [ -n "$PORT_INFO" ]; then
        echo "🌐 端口3000状态:"
        echo "$PORT_INFO" | while read line; do
            echo "   $line"
        done
    fi
fi

echo ""
echo "📝 日志文件: nohup.out"
if [ -f "nohup.out" ]; then
    echo "📏 日志大小: $(du -h nohup.out | cut -f1)"
    echo "🕐 最后10行日志:"
    echo "   =============="
    tail -n 10 nohup.out | sed 's/^/   /'
else
    echo "⚠️  日志文件不存在"
fi

echo ""
echo "💡 常用命令："
echo "   查看实时日志: tail -f nohup.out"
echo "   停止应用: ./stop.sh 或 pkill -f 'python3 app.py'"
echo "   重启应用: ./run.sh" 