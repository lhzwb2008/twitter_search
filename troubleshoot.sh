#!/bin/bash

# AI产品Twitter搜索工具故障排除脚本

echo "🔧 AI产品Twitter搜索工具 - 故障排除"
echo "===================================="

# 1. 检查进程状态
echo "1️⃣ 检查应用进程..."
PIDS=$(pgrep -f "python3 app.py")
if [ -z "$PIDS" ]; then
    echo "❌ 应用进程未运行"
    echo "💡 解决方案: 运行 ./deploy.sh 或 ./run.sh 启动应用"
    echo ""
else
    echo "✅ 应用进程正在运行 (PID: $PIDS)"
    echo "进程详情:"
    ps aux | grep "python3 app.py" | grep -v grep
    echo ""
fi

# 2. 检查端口监听
echo "2️⃣ 检查端口监听状态..."
if command -v ss &> /dev/null; then
    PORT_LISTEN=$(ss -tlnp | grep :3000)
    if [ -n "$PORT_LISTEN" ]; then
        echo "✅ 端口3000正在监听"
        echo "$PORT_LISTEN"
    else
        echo "❌ 端口3000未监听"
        echo "💡 可能原因: 应用启动失败或监听地址错误"
    fi
elif command -v netstat &> /dev/null; then
    PORT_LISTEN=$(netstat -tlnp | grep :3000)
    if [ -n "$PORT_LISTEN" ]; then
        echo "✅ 端口3000正在监听"
        echo "$PORT_LISTEN"
    else
        echo "❌ 端口3000未监听"
    fi
else
    echo "⚠️  无法检查端口状态 (缺少ss或netstat命令)"
fi
echo ""

# 3. 测试本地连接
echo "3️⃣ 测试本地连接..."
if command -v curl &> /dev/null; then
    echo "测试 http://localhost:3000 ..."
    CURL_OUTPUT=$(curl -s -w "HTTP_CODE:%{http_code}\nTIME:%{time_total}s" http://localhost:3000 2>&1)
    if echo "$CURL_OUTPUT" | grep -q "HTTP_CODE:200"; then
        echo "✅ 本地连接成功"
    else
        echo "❌ 本地连接失败"
        echo "响应详情:"
        echo "$CURL_OUTPUT"
    fi
else
    echo "⚠️  无法测试连接 (缺少curl命令)"
    echo "💡 安装curl: sudo yum install curl"
fi
echo ""

# 4. 检查防火墙
echo "4️⃣ 检查防火墙配置..."
if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
    echo "🟢 firewalld正在运行"
    
    if firewall-cmd --query-port=3000/tcp &> /dev/null; then
        echo "✅ 端口3000已在防火墙中开放"
    else
        echo "❌ 端口3000未在防火墙中开放"
        echo "💡 解决方案: sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload"
    fi
    
    echo "当前开放的端口:"
    firewall-cmd --list-ports
elif command -v iptables &> /dev/null; then
    echo "🟡 使用iptables防火墙"
    echo "当前规则:"
    sudo iptables -L INPUT | grep 3000 || echo "未找到3000端口相关规则"
else
    echo "🟡 未检测到防火墙或防火墙未运行"
fi
echo ""

# 5. 检查SELinux
echo "5️⃣ 检查SELinux状态..."
if command -v getenforce &> /dev/null; then
    SELINUX_STATUS=$(getenforce)
    echo "SELinux状态: $SELINUX_STATUS"
    
    if [ "$SELINUX_STATUS" = "Enforcing" ]; then
        echo "⚠️  SELinux可能阻止网络连接"
        echo "💡 临时禁用: sudo setenforce 0"
        echo "💡 永久禁用: 编辑 /etc/selinux/config 设置 SELINUX=disabled"
        
        # 检查SELinux日志
        if [ -f /var/log/audit/audit.log ]; then
            echo "检查SELinux拒绝日志..."
            RECENT_DENIALS=$(sudo ausearch -m avc -ts recent 2>/dev/null | grep python3 || echo "无相关拒绝记录")
            echo "$RECENT_DENIALS"
        fi
    fi
else
    echo "ℹ️  系统未安装SELinux"
fi
echo ""

# 6. 检查应用日志
echo "6️⃣ 检查应用日志..."
if [ -f "nohup.out" ]; then
    echo "📋 最近的应用日志 (最后20行):"
    echo "================================"
    tail -n 20 nohup.out
    echo "================================"
    
    # 检查错误信息
    echo ""
    echo "🔍 错误信息搜索:"
    if grep -i "error\|exception\|failed\|denied" nohup.out | tail -n 5; then
        echo "发现错误信息 ↑"
    else
        echo "未发现明显错误信息"
    fi
else
    echo "❌ 未找到日志文件 nohup.out"
    echo "💡 应用可能未启动或日志被删除"
fi
echo ""

# 7. 网络配置检查
echo "7️⃣ 网络配置检查..."
INTERNAL_IP=$(hostname -I | awk '{print $1}')
echo "内网IP: $INTERNAL_IP"

if command -v curl &> /dev/null; then
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "无法获取")
    echo "公网IP: $PUBLIC_IP"
fi

echo "网络接口:"
ip addr show | grep -E "inet.*scope global" | awk '{print $2, $NF}'
echo ""

# 8. 云服务器安全组检查提醒
echo "8️⃣ 云服务器安全组检查..."
echo "⚠️  重要提醒: 腾讯云需要在控制台配置安全组规则"
echo ""
echo "📋 腾讯云安全组配置步骤:"
echo "   1. 登录腾讯云控制台"
echo "   2. 进入 云服务器 CVM 管理"
echo "   3. 找到您的服务器实例"
echo "   4. 点击 '更多' -> '安全组' -> '配置安全组'"
echo "   5. 添加入站规则:"
echo "      - 协议: TCP"
echo "      - 端口: 3000"
echo "      - 来源: 0.0.0.0/0 (或指定IP)"
echo "      - 策略: 允许"
echo ""

# 9. 常见解决方案
echo "9️⃣ 常见解决方案..."
echo ""
echo "🔧 502 Bad Gateway 常见原因及解决方案:"
echo ""
echo "1. 应用未启动:"
echo "   检查: ps aux | grep python3"
echo "   解决: ./deploy.sh"
echo ""
echo "2. 应用监听地址错误:"
echo "   检查: ss -tlnp | grep 3000"
echo "   解决: 确保app.py中使用 host='0.0.0.0'"
echo ""
echo "3. 防火墙阻止:"
echo "   检查: firewall-cmd --list-ports"
echo "   解决: sudo firewall-cmd --add-port=3000/tcp --permanent"
echo ""
echo "4. 云服务器安全组未开放:"
echo "   检查: 腾讯云控制台安全组设置"
echo "   解决: 添加3000端口入站规则"
echo ""
echo "5. SELinux阻止:"
echo "   检查: getenforce"
echo "   解决: sudo setenforce 0 (临时)"
echo ""
echo "6. 应用启动失败:"
echo "   检查: tail -f nohup.out"
echo "   解决: 根据错误信息修复"
echo ""

echo "🎯 建议的排查顺序:"
echo "   1. 运行 ./deploy.sh 重新部署"
echo "   2. 检查 tail -f nohup.out 应用日志"
echo "   3. 确认腾讯云安全组已开放3000端口"
echo "   4. 测试本地连接: curl http://localhost:3000"
echo "   5. 如问题持续，临时禁用SELinux: sudo setenforce 0" 