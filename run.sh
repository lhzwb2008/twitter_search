#!/bin/bash

# AI产品Twitter搜索工具启动脚本

echo "🚀 AI产品Twitter搜索工具"
echo "=========================="

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误：未找到Python3，请先安装Python3"
    exit 1
fi

# 检查是否已安装依赖
if ! python3 -c "import flask" &> /dev/null; then
    echo "📦 正在安装依赖..."
    pip install -r requirements.txt
fi

# 检查API密钥
if [ -z "$BROWSER_USE_API_KEY" ]; then
    echo "⚠️  警告：未设置BROWSER_USE_API_KEY环境变量"
    echo "   将使用app.py中的默认API密钥"
fi

# 检查是否已有进程在运行
if pgrep -f "python3 app.py" > /dev/null; then
    echo "⚠️  检测到应用已在运行"
    echo "🔍 运行中的进程："
    pgrep -f "python3 app.py" | while read pid; do
        echo "   PID: $pid"
    done
    echo ""
    read -p "是否要停止现有进程并重新启动？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 停止现有进程..."
        pkill -f "python3 app.py"
        sleep 2
    else
        echo "📍 访问地址: http://localhost:3000"
        echo "💡 如需停止应用，请运行: pkill -f 'python3 app.py'"
        exit 0
    fi
fi

# 启动应用
echo "🌐 启动Web服务器（后台运行）..."
echo "📍 访问地址: http://localhost:3000"
echo "📝 日志文件: nohup.out"
echo "🛑 停止应用: pkill -f 'python3 app.py'"
echo ""

# 使用nohup后台运行
nohup python3 app.py > nohup.out 2>&1 &

# 获取进程ID
APP_PID=$!
echo "✅ 应用已启动！"
echo "🆔 进程ID: $APP_PID"
echo "📋 您现在可以安全地关闭终端"
echo ""
echo "💡 常用命令："
echo "   查看日志: tail -f nohup.out"
echo "   停止应用: pkill -f 'python3 app.py'"
echo "   查看进程: pgrep -f 'python3 app.py'" 