#!/bin/bash

# 端口配置脚本
# 允许用户自定义HTTP和HTTPS端口

set -e

echo "🔧 卫星跟踪系统端口配置工具"
echo "================================"

# 默认端口
DEFAULT_HTTP_PORT=18080
DEFAULT_HTTPS_PORT=18443

# 当前配置文件路径
NGINX_CONF="/etc/nginx/nginx.conf"
STANDALONE_CONF="nginx-standalone.conf"
FIREWALL_CONF="/etc/fail2ban/jail.d/nginx-satellite.conf"

echo "当前默认端口配置："
echo "HTTP端口: $DEFAULT_HTTP_PORT"
echo "HTTPS端口: $DEFAULT_HTTPS_PORT"
echo ""

# 获取用户输入
read -p "请输入新的HTTP端口 (留空使用默认 $DEFAULT_HTTP_PORT): " NEW_HTTP_PORT
read -p "请输入新的HTTPS端口 (留空使用默认 $DEFAULT_HTTPS_PORT): " NEW_HTTPS_PORT

# 使用默认值如果用户没有输入
NEW_HTTP_PORT=${NEW_HTTP_PORT:-$DEFAULT_HTTP_PORT}
NEW_HTTPS_PORT=${NEW_HTTPS_PORT:-$DEFAULT_HTTPS_PORT}

# 验证端口范围
if ! [[ "$NEW_HTTP_PORT" =~ ^[0-9]+$ ]] || [ "$NEW_HTTP_PORT" -lt 1024 ] || [ "$NEW_HTTP_PORT" -gt 65535 ]; then
    echo "❌ HTTP端口无效，请使用1024-65535范围内的数字"
    exit 1
fi

if ! [[ "$NEW_HTTPS_PORT" =~ ^[0-9]+$ ]] || [ "$NEW_HTTPS_PORT" -lt 1024 ] || [ "$NEW_HTTPS_PORT" -gt 65535 ]; then
    echo "❌ HTTPS端口无效，请使用1024-65535范围内的数字"
    exit 1
fi

if [ "$NEW_HTTP_PORT" -eq "$NEW_HTTPS_PORT" ]; then
    echo "❌ HTTP和HTTPS端口不能相同"
    exit 1
fi

echo ""
echo "新的端口配置："
echo "HTTP端口: $NEW_HTTP_PORT"
echo "HTTPS端口: $NEW_HTTPS_PORT"
echo ""

# 确认更改
read -p "确认更改端口配置？(y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "❌ 操作已取消"
    exit 0
fi

echo "🔧 正在更新配置文件..."

# 检查端口是否被占用
echo "📋 检查端口占用情况..."
if ss -tlnp | grep -q ":$NEW_HTTP_PORT "; then
    echo "⚠️  警告: 端口 $NEW_HTTP_PORT 已被占用"
    ss -tlnp | grep ":$NEW_HTTP_PORT "
    read -p "是否继续？(y/N): " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

if ss -tlnp | grep -q ":$NEW_HTTPS_PORT "; then
    echo "⚠️  警告: 端口 $NEW_HTTPS_PORT 已被占用"
    ss -tlnp | grep ":$NEW_HTTPS_PORT "
    read -p "是否继续？(y/N): " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 备份原配置
echo "💾 备份原配置文件..."
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
fi

if [ -f "$STANDALONE_CONF" ]; then
    cp "$STANDALONE_CONF" "$STANDALONE_CONF.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 更新nginx-standalone.conf
echo "📝 更新Nginx配置..."
sed -i "s/listen $DEFAULT_HTTP_PORT;/listen $NEW_HTTP_PORT;/g" "$STANDALONE_CONF"
sed -i "s/listen $DEFAULT_HTTPS_PORT ssl/listen $NEW_HTTPS_PORT ssl/g" "$STANDALONE_CONF"
sed -i "s/:$DEFAULT_HTTPS_PORT\$request_uri/:$NEW_HTTPS_PORT\$request_uri/g" "$STANDALONE_CONF"

# 如果系统已部署，更新系统配置
if [ -f "$NGINX_CONF" ]; then
    echo "📝 更新系统Nginx配置..."
    sed -i "s/listen $DEFAULT_HTTP_PORT;/listen $NEW_HTTP_PORT;/g" "$NGINX_CONF"
    sed -i "s/listen $DEFAULT_HTTPS_PORT ssl/listen $NEW_HTTPS_PORT ssl/g" "$NGINX_CONF"
    sed -i "s/:$DEFAULT_HTTPS_PORT\$request_uri/:$NEW_HTTPS_PORT\$request_uri/g" "$NGINX_CONF"
    
    # 测试Nginx配置
    echo "🧪 测试Nginx配置..."
    if ! nginx -t; then
        echo "❌ Nginx配置测试失败，恢复备份"
        cp "$NGINX_CONF.backup.$(date +%Y%m%d)"* "$NGINX_CONF"
        exit 1
    fi
fi

# 更新防火墙配置
echo "🔥 更新防火墙配置..."
if command -v ufw >/dev/null 2>&1; then
    # 删除旧规则
    ufw --force delete allow $DEFAULT_HTTP_PORT/tcp 2>/dev/null || true
    ufw --force delete allow $DEFAULT_HTTPS_PORT/tcp 2>/dev/null || true
    
    # 添加新规则
    ufw allow $NEW_HTTP_PORT/tcp comment 'Satellite Tracker HTTP'
    ufw allow $NEW_HTTPS_PORT/tcp comment 'Satellite Tracker HTTPS'
fi

# 更新fail2ban配置
if [ -f "$FIREWALL_CONF" ]; then
    echo "🛡️ 更新fail2ban配置..."
    sed -i "s/port = $DEFAULT_HTTP_PORT,$DEFAULT_HTTPS_PORT/port = $NEW_HTTP_PORT,$NEW_HTTPS_PORT/g" "$FIREWALL_CONF"
fi

# 重启服务
echo "🔄 重启服务..."
if systemctl is-active --quiet nginx; then
    systemctl restart nginx
    echo "✅ Nginx已重启"
fi

if systemctl is-active --quiet fail2ban; then
    systemctl restart fail2ban
    echo "✅ fail2ban已重启"
fi

echo ""
echo "✅ 端口配置更新完成！"
echo "🌐 新的访问地址："
echo "   HTTPS: https://$(hostname -I | awk '{print $1}'):$NEW_HTTPS_PORT"
echo "   HTTP:  http://$(hostname -I | awk '{print $1}'):$NEW_HTTP_PORT (自动重定向)"
echo ""
echo "📋 管理命令："
echo "   查看防火墙状态: sudo ufw status"
echo "   查看Nginx状态: sudo systemctl status nginx"
echo "   查看端口监听: sudo ss -tlnp | grep -E ':($NEW_HTTP_PORT|$NEW_HTTPS_PORT) '"
echo ""
echo "⚠️  注意：如果使用云服务器，请同时更新安全组规则！"

# 创建端口信息文件
cat > port-info.txt << EOF
# 当前端口配置
HTTP_PORT=$NEW_HTTP_PORT
HTTPS_PORT=$NEW_HTTPS_PORT
UPDATE_TIME=$(date)
EOF

echo "📄 端口信息已保存到 port-info.txt"
