#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import time
import os
from datetime import datetime, timezone, timedelta
from skyfield.api import load, Topos, utc, wgs84
from skyfield.sgp4lib import EarthSatellite
from base_ctrl import BaseController

class SatelliteTracker:
    def __init__(self):
        self.ts = load.timescale()
        self.current_satellite = None
        self.ground_station = None
        self.trajectory_points = []
        self.is_tracking = False
        self.gimbal = None
        
    def init_gimbal(self):
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
            
            print(f"\n正在初始化云台控制器:")
            print(f"- 使用设备: {device}")
            print(f"- 波特率: 115200")
            print(f"- 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            
            self.gimbal = BaseController(device, 115200)
            print("云台控制器初始化成功！")
            return True
        except Exception as e:
            print(f"云台控制器初始化失败: {e}")
            return False

    def load_satellite(self, tle_data):
        """加载卫星TLE数据"""
        try:
            name = tle_data['name']
            line1 = tle_data['line1']
            line2 = tle_data['line2']
            
            print(f"\n正在加载卫星数据:")
            print(f"- 卫星名称: {name}")
            print(f"- TLE数据: {line1[:20]}...")
            
            self.current_satellite = EarthSatellite(line1, line2, name, self.ts)
            return True
        except Exception as e:
            print(f"加载卫星数据失败: {e}")
            return False

    def set_ground_station(self, latitude, longitude, altitude=0):
        """设置地面站位置"""
        try:
            self.ground_station = wgs84.latlon(latitude, longitude, elevation_m=altitude)
            print(f"\n地面站位置设置成功:")
            print(f"- 纬度: {latitude}°")
            print(f"- 经度: {longitude}°")
            print(f"- 海拔: {altitude}m")
            return True
        except Exception as e:
            print(f"设置地面站位置失败: {e}")
            return False

    def calculate_trajectory(self, start_time, duration_hours=24):
        """计算卫星轨迹"""
        try:
            print(f"\n开始计算卫星轨迹:")
            print(f"- 起始时间: {start_time}")
            print(f"- 计算时长: {duration_hours}小时")
            
            # 计算时间点
            time_points = []
            current_time = start_time
            end_time = start_time + timedelta(hours=duration_hours)
            
            while current_time <= end_time:
                time_points.append(current_time)
                current_time += timedelta(seconds=10)
            
            # 批量计算位置
            t_array = self.ts.from_datetimes(time_points)
            difference = self.current_satellite - self.ground_station
            topocentric = difference.at(t_array)
            alt, az, distance = topocentric.altaz()
            
            # 构建轨迹点
            self.trajectory_points = []
            for i, time_point in enumerate(time_points):
                azimuth = az.degrees[i] if hasattr(az.degrees, '__len__') else az.degrees
                elevation = alt.degrees[i] if hasattr(alt.degrees, '__len__') else alt.degrees
                
                is_visible = bool(elevation > 5)
                
                point = {
                    'time': time_point,
                    'azimuth': round(float(azimuth), 3),
                    'elevation': round(float(elevation), 3),
                    'visible': is_visible
                }
                self.trajectory_points.append(point)
            
            # 找出可见时间段
            visible_periods = []
            period_start = None
            
            for point in self.trajectory_points:
                if point['visible'] and period_start is None:
                    period_start = point['time']
                elif not point['visible'] and period_start is not None:
                    visible_periods.append((period_start, point['time']))
                    period_start = None
            
            if period_start is not None:
                visible_periods.append((period_start, self.trajectory_points[-1]['time']))
            
            print(f"\n找到 {len(visible_periods)} 个可见时间段:")
            for i, (start, end) in enumerate(visible_periods, 1):
                print(f"时间段 {i}:")
                print(f"- 开始时间: {start}")
                print(f"- 结束时间: {end}")
                print(f"- 持续时间: {end - start}")
            
            return True
        except Exception as e:
            print(f"计算卫星轨迹失败: {e}")
            return False

    def get_current_position(self, current_time):
        """获取当前卫星位置"""
        try:
            # 检查是否在可见时间段内
            is_visible = False
            current_azimuth = 0
            current_elevation = 0
            
            for point in self.trajectory_points:
                if point['time'] <= current_time <= point['time'] + timedelta(seconds=10):
                    is_visible = point['visible']
                    if is_visible:
                        current_azimuth = point['azimuth']
                        current_elevation = point['elevation']
                    break
            
            return is_visible, current_azimuth, current_elevation
        except Exception as e:
            print(f"获取当前位置失败: {e}")
            return False, 0, 0

    def control_gimbal(self, azimuth, elevation):
        """控制云台"""
        try:
            if not self.gimbal:
                print("云台控制器未初始化")
                return False
            
            print(f"\n云台控制信息:")
            print(f"- 目标方位角: {azimuth:.2f}°")
            print(f"- 目标俯仰角: {elevation:.2f}°")
            print(f"- 控制时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            
            self.gimbal.gimbal_ctrl(azimuth, elevation, 10, 0)
            time.sleep(2)
            
            print("云台移动完成！")
            return True
        except Exception as e:
            print(f"云台控制失败: {e}")
            return False

def get_user_input():
    """获取用户输入的TLE数据"""
    print("\n请输入卫星TLE数据:")
    name = input("卫星名称: ")
    line1 = input("TLE Line 1: ")
    line2 = input("TLE Line 2: ")
    
    print("\n请输入地面站位置:")
    try:
        latitude = float(input("纬度 (度): "))
        longitude = float(input("经度 (度): "))
        altitude = float(input("海拔 (米): "))
        
        return {
            'tle': {'name': name, 'line1': line1, 'line2': line2},
            'ground_station': {'latitude': latitude, 'longitude': longitude, 'altitude': altitude}
        }
    except ValueError:
        print("输入无效，请输入数字")
        return None

def main():
    print("卫星跟踪云台控制系统")
    print("=" * 50)
    
    # 创建跟踪器实例
    tracker = SatelliteTracker()
    
    # 初始化云台
    if not tracker.init_gimbal():
        print("程序退出：云台控制器初始化失败")
        sys.exit(1)
    
    # 获取用户输入
    data = get_user_input()
    if not data:
        print("程序退出：输入数据无效")
        sys.exit(1)
    
    # 加载卫星数据
    if not tracker.load_satellite(data['tle']):
        print("程序退出：加载卫星数据失败")
        sys.exit(1)
    
    # 设置地面站
    if not tracker.set_ground_station(
        data['ground_station']['latitude'],
        data['ground_station']['longitude'],
        data['ground_station']['altitude']
    ):
        print("程序退出：设置地面站失败")
        sys.exit(1)
    
    # 计算轨迹
    start_time = datetime.now(timezone.utc)
    if not tracker.calculate_trajectory(start_time):
        print("程序退出：计算轨迹失败")
        sys.exit(1)
    
    print("\n开始跟踪卫星...")
    print("按 Ctrl+C 停止跟踪")
    
    try:
        while True:
            current_time = datetime.now(timezone.utc)
            is_visible, azimuth, elevation = tracker.get_current_position(current_time)
            
            if is_visible:
                print(f"\n当前时间: {current_time}")
                print(f"卫星可见，正在跟踪...")
                tracker.control_gimbal(azimuth, elevation)
            else:
                print(f"\n当前时间: {current_time}")
                print(f"卫星不可见，云台归零...")
                tracker.control_gimbal(0, 0)
            
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n停止跟踪")
        tracker.control_gimbal(0, 0)
        print("云台已归零")
    
    print("\n程序已退出")

if __name__ == '__main__':
    main() 