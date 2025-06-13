#!/bin/bash

# 卫星跟踪系统独立部署脚本（非Docker）
# 使用非标准端口提高安全性

set -e

echo "🚀 开始部署卫星跟踪系统（独立模式）..."

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用root权限运行此脚本: sudo $0"
    exit 1
fi

# 系统信息
echo "📋 检查系统信息..."
echo "系统: $(lsb_release -d | cut -f2)"
echo "内核: $(uname -r)"

# 更新系统包
echo "📦 更新系统包..."
apt update
apt upgrade -y

# 安装必要的软件包
echo "🔧 安装必要软件包..."
apt install -y nginx python3 python3-pip python3-venv openssl ufw fail2ban

# 创建应用目录
APP_DIR="/opt/satellite-tracker"
echo "📁 创建应用目录: $APP_DIR"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/ssl
mkdir -p $APP_DIR/logs
mkdir -p /var/log/nginx

# 复制应用文件
echo "📋 复制应用文件..."
cp -r . $APP_DIR/
chown -R www-data:www-data $APP_DIR

# 创建Python虚拟环境
echo "🐍 创建Python虚拟环境..."
cd $APP_DIR
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 生成SSL证书
echo "🔐 生成SSL证书..."
cd $APP_DIR
openssl genrsa -out ssl/server.key 2048
openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=SatelliteTracker/OU=IT/CN=localhost"
openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt
rm ssl/server.csr
chmod 600 ssl/server.key
chmod 644 ssl/server.crt
chown -R www-data:www-data ssl/

# 配置Nginx
echo "🌐 配置Nginx..."
cp nginx-standalone.conf /etc/nginx/nginx.conf
nginx -t

# 创建systemd服务文件
echo "⚙️ 创建systemd服务..."
cat > /etc/systemd/system/satellite-tracker.service << EOF
[Unit]
Description=Satellite Tracker Application
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
Environment=PATH=$APP_DIR/venv/bin
ExecStart=$APP_DIR/venv/bin/python server.py
Restart=always
RestartSec=10

# 日志配置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=satellite-tracker

# 安全配置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF

# 配置防火墙
echo "🔥 配置防火墙..."
ufw --force enable
ufw allow ssh
ufw allow 8080/tcp comment 'Satellite Tracker HTTP'
ufw allow 8443/tcp comment 'Satellite Tracker HTTPS'

# 配置fail2ban
echo "🛡️ 配置fail2ban..."
cat > /etc/fail2ban/jail.d/nginx-satellite.conf << EOF
[nginx-satellite]
enabled = true
port = 8080,8443
filter = nginx-limit-req
logpath = /var/log/nginx/satellite-tracker-error.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

# 重新加载systemd
systemctl daemon-reload

# 启动服务
echo "🚀 启动服务..."
systemctl enable satellite-tracker
systemctl start satellite-tracker
systemctl enable nginx
systemctl restart nginx
systemctl restart fail2ban

# 检查服务状态
echo "📊 检查服务状态..."
echo "Satellite Tracker服务状态:"
systemctl status satellite-tracker --no-pager -l
echo ""
echo "Nginx服务状态:"
systemctl status nginx --no-pager -l

# 显示访问信息
echo ""
echo "✅ 部署完成！"
echo "🌐 访问地址:"
echo "   HTTPS: https://$(hostname -I | awk '{print $1}'):8443"
echo "   HTTP:  http://$(hostname -I | awk '{print $1}'):8080 (自动重定向到HTTPS)"
echo ""
echo "📋 管理命令:"
echo "   查看应用日志: journalctl -u satellite-tracker -f"
echo "   查看Nginx日志: tail -f /var/log/nginx/satellite-tracker-*.log"
echo "   重启应用: sudo systemctl restart satellite-tracker"
echo "   重启Nginx: sudo systemctl restart nginx"
echo "   查看防火墙状态: sudo ufw status"
echo ""
echo "🔐 安全特性:"
echo "   - 使用非标准端口 8080/8443 避免扫描"
echo "   - 启用UFW防火墙保护"
echo "   - 配置fail2ban防暴力破解"
echo "   - SSL/TLS加密传输"
echo "   - 安全头防护"
echo ""
echo "⚠️  注意事项:"
echo "   - 首次访问会显示证书警告，请手动信任自签名证书"
echo "   - 建议定期更新系统和应用"
echo "   - 生产环境建议使用正式SSL证书"
