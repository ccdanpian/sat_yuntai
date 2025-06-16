#!/bin/bash

# 卫星跟踪系统清理脚本
# 用于清理所有安装组件，以便重新安装

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 打印横幅
print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                🛰️  卫星跟踪云台控制系统                      ║"
    echo "║                Satellite Tracking Gimbal System            ║"
    echo "║                                                            ║"
    echo "║                     清理脚本 v1.0.0                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "请使用root权限运行此脚本: sudo $0"
        exit 1
    fi
}

# 清理系统服务
cleanup_system_service() {
    print_info "清理系统服务..."
    
    # 停止并禁用服务
    systemctl stop satellite-tracker 2>/dev/null || true
    systemctl disable satellite-tracker 2>/dev/null || true
    
    # 删除服务文件
    rm -f /etc/systemd/system/satellite-tracker.service
    
    # 重新加载systemd
    systemctl daemon-reload
    
    print_success "系统服务清理完成"
}

# 清理应用目录
cleanup_app_directories() {
    print_info "清理应用目录..."
    
    # 清理standalone安装目录
    rm -rf /opt/satellite-tracker
    
    # 清理虚拟环境
    rm -rf $HOME/satellite-tracker-venv
    
    # 清理当前目录下的启动脚本
    rm -f start_satellite_tracker.sh
    
    print_success "应用目录清理完成"
}

# 清理防火墙规则
cleanup_firewall() {
    print_info "清理防火墙规则..."
    
    if command -v ufw &> /dev/null; then
        # 删除standalone安装的规则
        ufw delete allow 8080/tcp 2>/dev/null || true
        ufw delete allow 8443/tcp 2>/dev/null || true
        
        # 删除普通安装的规则
        ufw delete allow 15000/tcp 2>/dev/null || true
        
        print_success "防火墙规则清理完成"
    else
        print_warning "未检测到UFW防火墙"
    fi
}

# 清理fail2ban配置
cleanup_fail2ban() {
    print_info "清理fail2ban配置..."
    
    if command -v fail2ban-server &> /dev/null; then
        rm -f /etc/fail2ban/jail.d/nginx-satellite.conf
        systemctl restart fail2ban
        print_success "fail2ban配置清理完成"
    else
        print_warning "未检测到fail2ban"
    fi
}

# 清理Nginx配置
cleanup_nginx() {
    print_info "清理Nginx配置..."
    
    if command -v nginx &> /dev/null; then
        # 备份当前配置
        if [ -f /etc/nginx/nginx.conf ]; then
            cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
        fi
        
        # 恢复默认Nginx配置
        if [ -f /etc/nginx/nginx.conf.default ]; then
            cp /etc/nginx/nginx.conf.default /etc/nginx/nginx.conf
        else
            # 如果没有默认配置，创建一个基本的配置
            cat > /etc/nginx/nginx.conf << EOF
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
}

http {
    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    gzip on;
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF
        fi
        
        # 删除应用特定的配置
        rm -f /etc/nginx/sites-enabled/satellite-tracker
        rm -f /etc/nginx/sites-available/satellite-tracker
        
        # 删除SSL证书配置
        rm -f /etc/nginx/conf.d/satellite-tracker-ssl.conf
        
        # 测试Nginx配置
        nginx -t
        
        # 重启Nginx
        systemctl restart nginx
        
        print_success "Nginx配置清理完成"
    else
        print_warning "未检测到Nginx"
    fi
}

# 主清理流程
main() {
    print_banner
    
    # 检查权限
    check_root
    
    # 确认清理
    echo
    read -p "是否开始清理卫星跟踪云台控制系统? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "清理已取消"
        exit 0
    fi
    
    # 执行清理步骤
    cleanup_system_service
    cleanup_app_directories
    cleanup_firewall
    cleanup_fail2ban
    cleanup_nginx
    
    print_success "清理完成！"
    echo
    echo "📋 清理内容:"
    echo "  - 系统服务"
    echo "  - 应用目录"
    echo "  - 防火墙规则"
    echo "  - fail2ban配置"
    echo "  - Nginx配置"
    echo
    echo "✅ 现在可以重新安装系统了"
}

# 错误处理
trap 'print_error "清理过程中发生错误，请检查日志"; exit 1' ERR

# 运行主函数
main "$@" 