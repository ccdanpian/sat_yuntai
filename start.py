#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
卫星跟踪云台控制系统启动脚本

这个脚本提供了一个友好的启动界面，包括：
- 系统环境检查
- 依赖安装检查
- 配置验证
- 服务启动
"""

import os
import sys
import subprocess
import platform
import importlib
from pathlib import Path

def print_banner():
    """打印系统横幅"""
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║                🛰️  卫星跟踪云台控制系统                      ║
    ║                Satellite Tracking Gimbal System            ║
    ║                                                            ║
    ║                     Version 1.0.0                         ║
    ╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)

def check_python_version():
    """检查Python版本"""
    print("🐍 检查Python版本...")
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ 错误: 需要Python 3.8或更高版本")
        print(f"   当前版本: {version.major}.{version.minor}.{version.micro}")
        return False
    print(f"✅ Python版本检查通过: {version.major}.{version.minor}.{version.micro}")
    return True

def check_system_info():
    """检查系统信息"""
    print("\n💻 系统信息:")
    print(f"   操作系统: {platform.system()} {platform.release()}")
    print(f"   架构: {platform.machine()}")
    print(f"   处理器: {platform.processor()}")
    
    # 检查是否为树莓派
    try:
        with open('/proc/cpuinfo', 'r') as f:
            cpuinfo = f.read()
            if 'Raspberry Pi' in cpuinfo:
                if 'Raspberry Pi 5' in cpuinfo:
                    print("🍓 检测到树莓派5")
                else:
                    print("🍓 检测到树莓派")
            else:
                print("💻 非树莓派系统")
    except FileNotFoundError:
        print("💻 非Linux系统")

def check_dependencies():
    """检查依赖包"""
    print("\n📦 检查依赖包...")
    
    required_packages = [
        'flask',
        'flask_cors', 
        'skyfield',
        'numpy',
        'serial',
        'requests',
        'yaml'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            if package == 'serial':
                importlib.import_module('serial')
            elif package == 'flask_cors':
                importlib.import_module('flask_cors')
            elif package == 'yaml':
                importlib.import_module('yaml')
            else:
                importlib.import_module(package)
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package} (缺失)")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n⚠️  发现缺失的依赖包: {', '.join(missing_packages)}")
        print("请运行以下命令安装依赖:")
        print("pip install -r requirements.txt")
        return False
    
    print("✅ 所有依赖包检查通过")
    return True

def check_config_file():
    """检查配置文件"""
    print("\n⚙️  检查配置文件...")
    
    config_file = Path('config.yaml')
    if not config_file.exists():
        print("❌ 配置文件 config.yaml 不存在")
        return False
    
    try:
        import yaml
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        print("✅ 配置文件格式正确")
        return True
    except Exception as e:
        print(f"❌ 配置文件格式错误: {e}")
        return False

def check_serial_ports():
    """检查串口设备"""
    print("\n🔌 检查串口设备...")
    
    # 常见的串口设备路径
    serial_devices = [
        '/dev/ttyAMA0',  # 树莓派5
        '/dev/serial0',  # 其他树莓派
        '/dev/ttyUSB0',  # USB串口
        '/dev/ttyACM0',  # USB CDC设备
    ]
    
    available_devices = []
    for device in serial_devices:
        if os.path.exists(device):
            available_devices.append(device)
            print(f"✅ 发现串口设备: {device}")
    
    if not available_devices:
        print("⚠️  未发现串口设备，将使用模拟模式")
    
    return True

def install_dependencies():
    """安装依赖包"""
    print("\n📥 正在安装依赖包...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✅ 依赖包安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 依赖包安装失败: {e}")
        return False

def start_server():
    """启动服务器"""
    print("\n🚀 启动卫星跟踪云台控制系统...")
    print("\n" + "="*60)
    print("系统启动中，请稍候...")
    print("访问地址: http://localhost:15000")
    print("按 Ctrl+C 停止服务")
    print("="*60 + "\n")
    
    try:
        # 启动Flask服务器
        subprocess.run([sys.executable, 'server.py'])
    except KeyboardInterrupt:
        print("\n\n🛑 服务已停止")
    except Exception as e:
        print(f"\n❌ 启动失败: {e}")

def main():
    """主函数"""
    print_banner()
    
    # 检查Python版本
    if not check_python_version():
        sys.exit(1)
    
    # 显示系统信息
    check_system_info()
    
    # 检查配置文件
    if not check_config_file():
        print("\n请确保 config.yaml 文件存在且格式正确")
        sys.exit(1)
    
    # 检查依赖包
    if not check_dependencies():
        response = input("\n是否自动安装缺失的依赖包? (y/n): ")
        if response.lower() in ['y', 'yes', '是']:
            if not install_dependencies():
                sys.exit(1)
            # 重新检查依赖
            if not check_dependencies():
                sys.exit(1)
        else:
            print("请手动安装依赖包后重新运行")
            sys.exit(1)
    
    # 检查串口设备
    check_serial_ports()
    
    print("\n🎉 系统检查完成，准备启动服务...")
    
    # 询问是否启动
    response = input("\n是否现在启动服务? (y/n): ")
    if response.lower() in ['y', 'yes', '是', '']:
        start_server()
    else:
        print("\n可以稍后运行 'python server.py' 启动服务")

if __name__ == '__main__':
    main()
