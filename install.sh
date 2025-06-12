#!/bin/bash

# 卫星跟踪云台控制系统安装脚本
# 适用于树莓派和其他Linux系统

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
    echo "║                     安装脚本 v1.0.0                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "检测到root用户，建议使用普通用户安装"
        read -p "是否继续? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检测系统类型
detect_system() {
    print_info "检测系统类型..."
    
    if [[ -f /proc/cpuinfo ]]; then
        if grep -q "Raspberry Pi" /proc/cpuinfo; then
            if grep -q "Raspberry Pi 5" /proc/cpuinfo; then
                SYSTEM_TYPE="raspberry_pi5"
                print_success "检测到树莓派5"
            else
                SYSTEM_TYPE="raspberry_pi"
                print_success "检测到树莓派"
            fi
        else
            SYSTEM_TYPE="linux"
            print_success "检测到Linux系统"
        fi
    else
        SYSTEM_TYPE="unknown"
        print_warning "无法检测系统类型"
    fi
}

# 更新系统包
update_system() {
    print_info "更新系统包..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get upgrade -y
    elif command -v yum &> /dev/null; then
        sudo yum update -y
    elif command -v pacman &> /dev/null; then
        sudo pacman -Syu --noconfirm
    else
        print_warning "无法识别包管理器，请手动更新系统"
    fi
}

# 安装系统依赖
install_system_dependencies() {
    print_info "安装系统依赖..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y \
            python3 \
            python3-pip \
            python3-venv \
            git \
            curl \
            wget \
            build-essential \
            python3-dev \
            libffi-dev \
            libssl-dev
    elif command -v yum &> /dev/null; then
        sudo yum install -y \
            python3 \
            python3-pip \
            git \
            curl \
            wget \
            gcc \
            python3-devel \
            libffi-devel \
            openssl-devel
    else
        print_error "不支持的包管理器"
        exit 1
    fi
}

# 配置串口权限（仅树莓派）
configure_serial_permissions() {
    if [[ $SYSTEM_TYPE == "raspberry_pi"* ]]; then
        print_info "配置串口权限..."
        
        # 添加用户到dialout组
        sudo usermod -a -G dialout $USER
        
        # 启用串口
        if [[ $SYSTEM_TYPE == "raspberry_pi5" ]]; then
            # 树莓派5的串口配置
            if ! grep -q "dtparam=uart0=on" /boot/config.txt; then
                echo "dtparam=uart0=on" | sudo tee -a /boot/config.txt
            fi
        else
            # 其他树莓派的串口配置
            if ! grep -q "enable_uart=1" /boot/config.txt; then
                echo "enable_uart=1" | sudo tee -a /boot/config.txt
            fi
        fi
        
        # 禁用串口控制台
        sudo systemctl disable serial-getty@ttyAMA0.service 2>/dev/null || true
        sudo systemctl disable serial-getty@serial0.service 2>/dev/null || true
        
        print_success "串口配置完成"
        print_warning "需要重启系统以使串口配置生效"
    fi
}

# 创建虚拟环境
create_virtual_environment() {
    print_info "创建Python虚拟环境..."
    
    VENV_DIR="$HOME/satellite-tracker-venv"
    
    if [[ -d $VENV_DIR ]]; then
        print_warning "虚拟环境已存在，删除旧环境"
        rm -rf $VENV_DIR
    fi
    
    python3 -m venv $VENV_DIR
    source $VENV_DIR/bin/activate
    
    # 升级pip
    pip install --upgrade pip
    
    print_success "虚拟环境创建完成: $VENV_DIR"
}

# 安装Python依赖
install_python_dependencies() {
    print_info "安装Python依赖包..."
    
    if [[ -f requirements.txt ]]; then
        pip install -r requirements.txt
        print_success "Python依赖安装完成"
    else
        print_error "requirements.txt文件不存在"
        exit 1
    fi
}

# 创建系统服务
create_system_service() {
    print_info "创建系统服务..."
    
    # 更新服务文件中的路径
    INSTALL_DIR=$(pwd)
    VENV_DIR="$HOME/satellite-tracker-venv"
    
    # 创建服务文件
    cat > satellite-tracker.service << EOF
[Unit]
Description=Satellite Tracking Gimbal Control System
Documentation=https://github.com/your-repo/satellite-tracker
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$VENV_DIR/bin/python $INSTALL_DIR/server.py
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
Environment=PYTHONUNBUFFERED=1
Environment=FLASK_ENV=production
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
LimitNOFILE=65536
LimitNPROC=4096
TimeoutStartSec=60
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF
    
    # 安装服务文件
    sudo cp satellite-tracker.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    print_success "系统服务创建完成"
}

# 创建启动脚本
create_startup_script() {
    print_info "创建启动脚本..."
    
    VENV_DIR="$HOME/satellite-tracker-venv"
    INSTALL_DIR=$(pwd)
    
    cat > start_satellite_tracker.sh << EOF
#!/bin/bash
# 卫星跟踪系统启动脚本

cd $INSTALL_DIR
source $VENV_DIR/bin/activate
python server.py
EOF
    
    chmod +x start_satellite_tracker.sh
    
    print_success "启动脚本创建完成: start_satellite_tracker.sh"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        sudo ufw allow 5000/tcp
        print_success "UFW防火墙配置完成"
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port=5000/tcp
        sudo firewall-cmd --reload
        print_success "firewalld防火墙配置完成"
    else
        print_warning "未检测到防火墙，请手动开放5000端口"
    fi
}

# 运行测试
run_tests() {
    print_info "运行系统测试..."
    
    # 激活虚拟环境
    VENV_DIR="$HOME/satellite-tracker-venv"
    source $VENV_DIR/bin/activate
    
    # 运行Python测试
    python -c "import flask, skyfield, serial, requests; print('所有依赖包导入成功')"
    
    # 测试配置文件
    python -c "import yaml; yaml.safe_load(open('config.yaml')); print('配置文件格式正确')"
    
    print_success "系统测试通过"
}

# 显示安装完成信息
show_completion_info() {
    print_success "安装完成！"
    echo
    echo "🚀 启动方式:"
    echo "  1. 手动启动: ./start_satellite_tracker.sh"
    echo "  2. 系统服务: sudo systemctl start satellite-tracker"
    echo "  3. 开机自启: sudo systemctl enable satellite-tracker"
    echo
    echo "🌐 访问地址: http://$(hostname -I | awk '{print $1}'):5000"
    echo
    echo "📋 常用命令:"
    echo "  查看服务状态: sudo systemctl status satellite-tracker"
    echo "  查看日志: sudo journalctl -u satellite-tracker -f"
    echo "  停止服务: sudo systemctl stop satellite-tracker"
    echo
    
    if [[ $SYSTEM_TYPE == "raspberry_pi"* ]]; then
        print_warning "请重启系统以使串口配置生效: sudo reboot"
    fi
}

# 主安装流程
main() {
    print_banner
    
    # 检查权限
    check_root
    
    # 检测系统
    detect_system
    
    # 确认安装
    echo
    read -p "是否开始安装卫星跟踪云台控制系统? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "安装已取消"
        exit 0
    fi
    
    # 执行安装步骤
    update_system
    install_system_dependencies
    configure_serial_permissions
    create_virtual_environment
    install_python_dependencies
    create_system_service
    create_startup_script
    configure_firewall
    run_tests
    
    # 显示完成信息
    show_completion_info
}

# 错误处理
trap 'print_error "安装过程中发生错误，请检查日志"; exit 1' ERR

# 运行主函数
main "$@"
