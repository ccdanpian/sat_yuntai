# 卫星跟踪系统独立部署指南

本指南介绍如何在Ubuntu系统上不使用Docker部署卫星跟踪系统，并使用非标准端口提高安全性。

## 🎯 部署特点

- **无Docker依赖**：直接在系统上运行
- **非标准端口**：使用8080/8443端口避免扫描
- **增强安全**：防火墙、fail2ban、SSL加密
- **系统服务**：systemd管理，开机自启
- **日志管理**：集中日志记录和监控

## 📋 系统要求

- **操作系统**：Ubuntu 18.04+ 或 Debian 10+
- **内存**：最低512MB，推荐1GB+
- **存储**：最低1GB可用空间
- **网络**：互联网连接（下载星历数据）
- **权限**：root或sudo权限

## 🚀 快速部署

### 方法一：自动安装脚本

```bash
# 下载项目
git clone <repository-url>
cd yuntai

# 运行自动安装脚本
sudo bash install-standalone.sh
```

### 方法二：手动安装

#### 1. 更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

#### 2. 安装依赖

```bash
sudo apt install -y nginx python3 python3-pip python3-venv openssl ufw fail2ban
```

#### 3. 创建应用目录

```bash
sudo mkdir -p /opt/satellite-tracker
sudo mkdir -p /opt/satellite-tracker/ssl
sudo mkdir -p /opt/satellite-tracker/logs
```

#### 4. 复制应用文件

```bash
sudo cp -r . /opt/satellite-tracker/
sudo chown -R www-data:www-data /opt/satellite-tracker
```

#### 5. 创建Python环境

```bash
cd /opt/satellite-tracker
sudo -u www-data python3 -m venv venv
sudo -u www-data venv/bin/pip install --upgrade pip
sudo -u www-data venv/bin/pip install -r requirements.txt
```

#### 6. 生成SSL证书

```bash
cd /opt/satellite-tracker
sudo openssl genrsa -out ssl/server.key 2048
sudo openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=SatelliteTracker/OU=IT/CN=localhost"
sudo openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt
sudo rm ssl/server.csr
sudo chmod 600 ssl/server.key
sudo chmod 644 ssl/server.crt
sudo chown -R www-data:www-data ssl/
```

#### 7. 配置Nginx

```bash
sudo cp nginx-standalone.conf /etc/nginx/nginx.conf
sudo nginx -t
```

#### 8. 创建系统服务

```bash
sudo tee /etc/systemd/system/satellite-tracker.service > /dev/null << EOF
[Unit]
Description=Satellite Tracker Application
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/satellite-tracker
Environment=PATH=/opt/satellite-tracker/venv/bin
ExecStart=/opt/satellite-tracker/venv/bin/python server.py
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
ReadWritePaths=/opt/satellite-tracker

[Install]
WantedBy=multi-user.target
EOF
```

#### 9. 配置防火墙

```bash
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 8080/tcp comment 'Satellite Tracker HTTP'
sudo ufw allow 8443/tcp comment 'Satellite Tracker HTTPS'
```

#### 10. 配置fail2ban

```bash
sudo tee /etc/fail2ban/jail.d/nginx-satellite.conf > /dev/null << EOF
[nginx-satellite]
enabled = true
port = 8080,8443
filter = nginx-limit-req
logpath = /var/log/nginx/satellite-tracker-error.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
```

#### 11. 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable satellite-tracker
sudo systemctl start satellite-tracker
sudo systemctl enable nginx
sudo systemctl restart nginx
sudo systemctl restart fail2ban
```

## 🌐 访问应用

部署完成后，可通过以下地址访问：

- **HTTPS（推荐）**：`https://your-server-ip:8443`
- **HTTP**：`http://your-server-ip:8080`（自动重定向到HTTPS）

### 获取服务器IP

```bash
# 获取内网IP
hostname -I | awk '{print $1}'

# 获取公网IP（如果有）
curl -s ifconfig.me
```

## 🔧 管理命令

### 服务管理

```bash
# 查看应用状态
sudo systemctl status satellite-tracker

# 重启应用
sudo systemctl restart satellite-tracker

# 停止应用
sudo systemctl stop satellite-tracker

# 查看应用日志
journalctl -u satellite-tracker -f
```

### Nginx管理

```bash
# 查看Nginx状态
sudo systemctl status nginx

# 重启Nginx
sudo systemctl restart nginx

# 测试配置
sudo nginx -t

# 查看访问日志
sudo tail -f /var/log/nginx/satellite-tracker-access.log

# 查看错误日志
sudo tail -f /var/log/nginx/satellite-tracker-error.log
```

### 防火墙管理

```bash
# 查看防火墙状态
sudo ufw status

# 查看详细规则
sudo ufw status verbose

# 添加新规则（如果需要）
sudo ufw allow from 192.168.1.0/24 to any port 8443
```

## 🔐 安全特性

### 端口安全
- **非标准端口**：8080/8443避免常见扫描
- **防火墙保护**：UFW限制访问端口
- **fail2ban**：防止暴力破解攻击

### SSL/TLS安全
- **强制HTTPS**：HTTP自动重定向
- **现代TLS**：支持TLS 1.2和1.3
- **安全头**：防XSS、点击劫持等攻击
- **HSTS**：强制浏览器使用HTTPS

### 系统安全
- **最小权限**：应用以www-data用户运行
- **沙箱保护**：systemd安全配置
- **日志监控**：集中日志记录

## 🛠️ 故障排除

### 常见问题

#### 1. 端口被占用

```bash
# 检查端口占用
sudo ss -tlnp | grep :8080
sudo ss -tlnp | grep :8443

# 停止占用端口的服务
sudo systemctl stop apache2  # 如果安装了Apache
```

#### 2. SSL证书问题

```bash
# 重新生成证书
sudo rm -rf /opt/satellite-tracker/ssl/*
cd /opt/satellite-tracker
# 重新执行证书生成步骤
```

#### 3. 权限问题

```bash
# 修复文件权限
sudo chown -R www-data:www-data /opt/satellite-tracker
sudo chmod 600 /opt/satellite-tracker/ssl/server.key
sudo chmod 644 /opt/satellite-tracker/ssl/server.crt
```

#### 4. Python依赖问题

```bash
# 重新安装依赖
cd /opt/satellite-tracker
sudo -u www-data venv/bin/pip install --upgrade pip
sudo -u www-data venv/bin/pip install -r requirements.txt
```

### 日志分析

```bash
# 应用日志
journalctl -u satellite-tracker --since "1 hour ago"

# Nginx错误日志
sudo tail -100 /var/log/nginx/satellite-tracker-error.log

# 系统日志
sudo tail -100 /var/log/syslog | grep satellite

# fail2ban日志
sudo tail -100 /var/log/fail2ban.log
```

## 📊 性能优化

### Nginx优化

```bash
# 编辑Nginx配置
sudo nano /etc/nginx/nginx.conf

# 调整worker进程数（根据CPU核心数）
worker_processes auto;

# 调整连接数
worker_connections 1024;
```

### 系统优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# 优化TCP参数
echo "net.core.somaxconn = 65536" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65536" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## 🔄 更新和维护

### 应用更新

```bash
# 备份当前版本
sudo cp -r /opt/satellite-tracker /opt/satellite-tracker.backup

# 更新代码
cd /path/to/new/code
sudo cp -r . /opt/satellite-tracker/
sudo chown -R www-data:www-data /opt/satellite-tracker

# 更新依赖
cd /opt/satellite-tracker
sudo -u www-data venv/bin/pip install -r requirements.txt

# 重启服务
sudo systemctl restart satellite-tracker
```

### 系统维护

```bash
# 定期更新系统
sudo apt update && sudo apt upgrade -y

# 清理日志（保留最近30天）
sudo journalctl --vacuum-time=30d

# 检查磁盘空间
df -h

# 检查内存使用
free -h
```

## 🚀 生产环境建议

1. **使用正式SSL证书**（Let's Encrypt或商业证书）
2. **配置域名**而不是直接使用IP
3. **设置监控**（如Prometheus + Grafana）
4. **定期备份**配置和数据
5. **配置日志轮转**避免磁盘空间不足
6. **使用反向代理**（如Cloudflare）进一步隐藏真实IP

## 📞 技术支持

如遇到问题，请检查：
1. 系统日志：`journalctl -u satellite-tracker -f`
2. Nginx日志：`/var/log/nginx/satellite-tracker-*.log`
3. 防火墙状态：`sudo ufw status`
4. 服务状态：`sudo systemctl status satellite-tracker nginx`
