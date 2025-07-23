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

# 启动应用
echo "🌐 启动Web服务器..."
echo "📍 访问地址: http://localhost:3000"
echo ""

python3 app.py 