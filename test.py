#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import time
from base_ctrl import BaseController

def init_gimbal():
    """初始化云台控制器"""
    try:
        # 检测树莓派型号
        try:
            with open('/proc/cpuinfo', 'r') as file:
                for line in file:
                    if 'Model' in line and 'Raspberry Pi 5' in line:
                        device = '/dev/ttyAMA0'
                        break
                else:
                    device = '/dev/serial0'
        except FileNotFoundError:
            print("警告: 未检测到树莓派系统，将使用默认串口设备")
            device = '/dev/serial0'
        
        print(f"正在初始化云台控制器，使用设备: {device}")
        gimbal = BaseController(device, 115200)
        print("云台控制器初始化成功！")
        return gimbal
    except Exception as e:
        print(f"云台控制器初始化失败: {e}")
        return None

def get_user_input():
    """获取用户输入的方位角和俯仰角"""
    while True:
        try:
            azimuth = float(input("请输入方位角 (-180 到 180 度): "))
            if not -180 <= azimuth <= 180:
                print("方位角必须在 -180 到 180 度之间")
                continue
                
            elevation = float(input("请输入俯仰角 (-30 到 90 度): "))
            if not -30 <= elevation <= 90:
                print("俯仰角必须在 -30 到 90 度之间")
                continue
                
            return azimuth, elevation
        except ValueError:
            print("请输入有效的数字")

def main():
    print("云台控制测试程序")
    print("=" * 50)
    
    # 初始化云台控制器
    gimbal = init_gimbal()
    if not gimbal:
        print("程序退出：云台控制器初始化失败")
        sys.exit(1)
    
    print("\n使用说明:")
    print("1. 输入方位角 (-180 到 180 度)")
    print("2. 输入俯仰角 (-30 到 90 度)")
    print("3. 输入 'q' 退出程序")
    print("=" * 50)
    
    while True:
        try:
            # 获取用户输入
            user_input = input("\n请输入方位角和俯仰角 (或输入 'q' 退出): ")
            if user_input.lower() == 'q':
                break
                
            azimuth, elevation = get_user_input()
            
            # 控制云台
            print(f"\n正在控制云台移动到: 方位角={azimuth:.2f}°, 俯仰角={elevation:.2f}°")
            gimbal.gimbal_ctrl(azimuth, elevation, 10, 0)
            
            # 等待云台移动完成
            time.sleep(2)
            
        except KeyboardInterrupt:
            print("\n程序被用户中断")
            break
        except Exception as e:
            print(f"发生错误: {e}")
    
    print("\n程序已退出")

if __name__ == '__main__':
    main() 