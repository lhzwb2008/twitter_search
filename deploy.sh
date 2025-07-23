#!/bin/bash

# AI产品Twitter搜索工具服务器部署脚本

echo "🚀 AI产品Twitter搜索工具 - 服务器部署"
echo "========================================"

# 检查系统信息
echo "📋 系统信息："
echo "   操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "   内核版本: $(uname -r)"
echo "   当前用户: $(whoami)"
echo ""

# 检查Python环境
echo "🐍 检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误：未找到Python3"
    echo "💡 请安装Python3: sudo yum install python3 python3-pip"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "✅ Python版本: $PYTHON_VERSION"

# 检查pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ 错误：未找到pip3"
    echo "💡 请安装pip3: sudo yum install python3-pip"
    exit 1
fi

# 安装依赖
echo ""
echo "📦 安装Python依赖..."
if ! python3 -c "import flask" &> /dev/null; then
    echo "正在安装Flask..."
    pip3 install -r requirements.txt --user
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败，尝试使用系统包管理器..."
        sudo yum install python3-flask python3-requests -y
    fi
fi

# 检查端口占用
echo ""
echo "🌐 检查端口状态..."
if command -v ss &> /dev/null; then
    PORT_CHECK=$(ss -tlnp | grep :3000)
    if [ -n "$PORT_CHECK" ]; then
        echo "⚠️  端口3000已被占用:"
        echo "$PORT_CHECK"
        echo ""
        read -p "是否要停止占用端口的进程？(y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo fuser -k 3000/tcp
            sleep 2
        fi
    else
        echo "✅ 端口3000可用"
    fi
fi

# 检查防火墙状态
echo ""
echo "🔥 检查防火墙状态..."
if command -v firewall-cmd &> /dev/null; then
    if systemctl is-active --quiet firewalld; then
        echo "🟢 firewalld正在运行"
        
        # 检查端口是否开放
        if firewall-cmd --query-port=3000/tcp &> /dev/null; then
            echo "✅ 端口3000已开放"
        else
            echo "⚠️  端口3000未开放"
            read -p "是否要开放端口3000？(Y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                sudo firewall-cmd --permanent --add-port=3000/tcp
                sudo firewall-cmd --reload
                echo "✅ 端口3000已开放"
            fi
        fi
        
        echo "📋 当前开放的端口:"
        firewall-cmd --list-ports
    else
        echo "🔴 firewalld未运行"
    fi
elif command -v iptables &> /dev/null; then
    echo "🟡 检测到iptables防火墙"
    echo "💡 请确保端口3000已开放: sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT"
else
    echo "🟡 未检测到防火墙服务"
fi

# 检查SELinux状态
echo ""
echo "🛡️  检查SELinux状态..."
if command -v getenforce &> /dev/null; then
    SELINUX_STATUS=$(getenforce)
    echo "SELinux状态: $SELINUX_STATUS"
    
    if [ "$SELINUX_STATUS" = "Enforcing" ]; then
        echo "⚠️  SELinux可能会阻止网络连接"
        echo "💡 如果遇到问题，可以临时设置为宽松模式: sudo setenforce 0"
    fi
fi

# 检查网络配置
echo ""
echo "🌍 网络配置检查..."
INTERNAL_IP=$(hostname -I | awk '{print $1}')
echo "内网IP: $INTERNAL_IP"

if command -v curl &> /dev/null; then
    echo "正在获取公网IP..."
    PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || echo "无法获取")
    echo "公网IP: $PUBLIC_IP"
fi

# 停止现有进程
echo ""
if pgrep -f "python3 app.py" > /dev/null; then
    echo "🛑 停止现有应用进程..."
    pkill -f "python3 app.py"
    sleep 2
fi

# 启动应用
echo ""
echo "🚀 启动应用..."
echo "📍 内网访问: http://$INTERNAL_IP:3000"
if [ "$PUBLIC_IP" != "无法获取" ] && [ "$PUBLIC_IP" != "$INTERNAL_IP" ]; then
    echo "📍 公网访问: http://$PUBLIC_IP:3000"
fi
echo "📝 日志文件: nohup.out"
echo ""

# 使用nohup后台运行
nohup python3 app.py > nohup.out 2>&1 &
APP_PID=$!

echo "✅ 应用已启动！"
echo "🆔 进程ID: $APP_PID"
echo ""

# 等待应用启动
echo "⏳ 等待应用启动..."
sleep 5

# 测试本地连接
echo "🧪 测试本地连接..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ 本地连接测试成功"
else
    echo "❌ 本地连接测试失败"
    echo "📋 查看日志:"
    tail -n 20 nohup.out
fi

echo ""
echo "🎉 部署完成！"
echo ""
echo "💡 常用命令："
echo "   查看状态: ./status.sh"
echo "   查看日志: tail -f nohup.out"
echo "   停止应用: ./stop.sh"
echo ""
echo "🔧 故障排除："
echo "   1. 如果无法访问，检查云服务器安全组是否开放3000端口"
echo "   2. 检查应用日志: tail -f nohup.out"
echo "   3. 检查进程状态: ps aux | grep python3"
echo "   4. 检查端口监听: ss -tlnp | grep 3000" 