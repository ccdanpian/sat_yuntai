#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
import threading
import os
from functools import wraps
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
import math

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from skyfield.api import load, Topos, utc, wgs84
from skyfield.sgp4lib import EarthSatellite
import numpy as np
import requests

# 添加serial模块导入，base_ctrl.py需要使用
try:
    import serial
except ImportError:
    print("警告: pyserial模块未安装，云台控制功能可能无法正常工作")
    serial = None

# 导入云台控制模块
try:
    from base_ctrl import BaseController
except ImportError:
    print("警告: base_ctrl模块未找到，将使用模拟模式")
    BaseController = None

# 导入中位设置模块
try:
    from calibration import create_calibration_instance
except ImportError:
    print("警告: calibration模块未找到，中位设置功能将不可用")
    create_calibration_instance = None

def load_local_env(path: str = '.env'):
    """Load simple KEY=value entries before reading runtime configuration."""
    if not os.path.exists(path):
        return

    try:
        with open(path, 'r', encoding='utf-8') as env_file:
            for raw_line in env_file:
                line = raw_line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        print(f"[WARNING] 加载.env失败: {e}")

load_local_env()

def get_float_env(name: str, default: float) -> float:
    raw_value = os.getenv(name, str(default))
    try:
        return float(raw_value)
    except ValueError:
        print(f"[WARNING] {name}={raw_value} 不是有效数字，使用默认值 {default}")
        return default

def get_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        return int(raw_value)
    except ValueError:
        print(f"[WARNING] {name}={raw_value} 不是有效整数，使用默认值 {default}")
        return default

app = Flask(__name__)

cors_origins = os.getenv('SAT_YUNTAI_CORS_ORIGINS', '').strip()
if cors_origins:
    CORS(app, origins=[origin.strip() for origin in cors_origins.split(',') if origin.strip()])

API_TOKEN = os.getenv('SAT_YUNTAI_API_TOKEN', '').strip()
ALLOWED_STATIC_FILES = {'app.js'}
ALLOWED_STATIC_DIRS = {'css', 'js'}
TLE_CACHE_DIR = os.getenv('SAT_YUNTAI_TLE_CACHE_DIR', 'tle')
TLE_REFRESH_INTERVAL = timedelta(days=get_float_env('TLE_UPDATE_INTERVAL', 1))

CONSTELLATION_URLS = {
    'gps': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
    'glonass': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass-ops&FORMAT=tle',
    'galileo': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
    'beidou': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle',
    'starlink': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    'starlink_dtc': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    'oneweb': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle',
    'iridium': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle',
    'globalstar': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle',
    'x2': 'https://celestrak.org/NORAD/elements/gp.php?INTDES=2025-067&FORMAT=tle',
    'x2-3': 'https://celestrak.org/NORAD/elements/gp.php?INTDES=2026-091&FORMAT=tle'
}
CONSTELLATION_LABELS = {
    'gps': 'GPS',
    'glonass': 'GLONASS',
    'galileo': 'Galileo',
    'beidou': '北斗',
    'starlink': '星链',
    'starlink_dtc': '星链DTC',
    'oneweb': 'OneWeb',
    'iridium': '铱星',
    'globalstar': '全球星',
    'x2': 'X2星座',
    'x2-3': 'X2-3星座'
}
MIN_VISIBLE_ELEVATION = get_float_env('MIN_VISIBLE_ELEVATION', 5)
MIN_PASS_MAX_ELEVATION = get_float_env('MIN_PASS_MAX_ELEVATION', 30)
TRACKING_STOP_ELEVATION = get_float_env('TRACKING_STOP_ELEVATION', 20)
TRACKING_UPDATE_INTERVAL = max(0.01, get_float_env('TRACKING_UPDATE_INTERVAL', 0.02))
GIMBAL_COMMAND_DEADBAND_DEGREES = max(0.0, get_float_env('GIMBAL_COMMAND_DEADBAND_DEGREES', 0.05))
GIMBAL_TRACKING_SPEED = max(1, get_int_env('GIMBAL_TRACKING_SPEED', 10))
GIMBAL_TRACKING_ACCELERATION = max(0, get_int_env('GIMBAL_TRACKING_ACCELERATION', 0))

def require_api_token(func):
    """Protect hardware-changing API endpoints when SAT_YUNTAI_API_TOKEN is set."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        if API_TOKEN:
            provided_token = request.headers.get('X-API-Token', '')
            if provided_token != API_TOKEN:
                return jsonify({'error': '未授权的控制请求'}), 401
        return func(*args, **kwargs)
    return wrapper

def get_tle_cache_path(constellation: str) -> str:
    safe_name = constellation.replace('/', '_').replace('\\', '_')
    return os.path.join(TLE_CACHE_DIR, f'{safe_name}.tle')

def load_tle_text(constellation: str, force_refresh: bool = False) -> Dict:
    constellation = constellation.lower()
    if constellation not in CONSTELLATION_URLS:
        raise ValueError(f'不支持的星座: {constellation}')

    os.makedirs(TLE_CACHE_DIR, exist_ok=True)
    cache_path = get_tle_cache_path(constellation)
    now = datetime.now(timezone.utc)
    cache_exists = os.path.exists(cache_path)
    cache_age = None

    if cache_exists:
        cache_mtime = datetime.fromtimestamp(os.path.getmtime(cache_path), tz=timezone.utc)
        cache_age = now - cache_mtime

    should_refresh = force_refresh or not cache_exists or (cache_age is not None and cache_age >= TLE_REFRESH_INTERVAL)

    if should_refresh:
        try:
            response = requests.get(CONSTELLATION_URLS[constellation], timeout=30)
            response.raise_for_status()
            tle_text = response.text.strip() + '\n'
            with open(cache_path, 'w', encoding='utf-8') as tle_file:
                tle_file.write(tle_text)
            return {
                'constellation': constellation,
                'tle': tle_text,
                'source': 'network',
                'cached': False,
                'cacheAgeSeconds': 0
            }
        except Exception as e:
            if not cache_exists:
                raise RuntimeError(f'下载星历失败且无本地缓存: {e}')
            print(f"[WARNING] 下载 {constellation} 星历失败，使用本地缓存: {e}")

    with open(cache_path, 'r', encoding='utf-8') as tle_file:
        tle_text = tle_file.read()

    cache_mtime = datetime.fromtimestamp(os.path.getmtime(cache_path), tz=timezone.utc)
    return {
        'constellation': constellation,
        'tle': tle_text,
        'source': 'cache',
        'cached': True,
        'cacheAgeSeconds': int((now - cache_mtime).total_seconds())
    }

class SatelliteTracker:
    def __init__(self):
        self.is_tracking = False
        self.current_satellite = None
        self.ground_station = None
        self.simulation_mode = False
        self.simulation_start_time = None
        self.tracking_thread = None
        self.current_azimuth = 0.0
        self.current_elevation = 0.0
        self.gimbal_controller = None
        self.trajectory_points = []  # 存储轨迹点数据
        self.last_satellite_visible = False
        self.last_control_error = None
        self.last_command_skipped_time = 0.0
        self.tracking_stop_reason = None
        self.tracking_stop_elevation = None
        self.tracking_stop_armed = False
        
        # 后端不再需要星座URL配置，由前端负责下载
        
        # 初始化云台控制器
        self.init_gimbal_controller()
        
        # 初始化中位设置模块
        self.calibration = None
        if create_calibration_instance:
            # 复用现有的云台控制器实例
            self.calibration = create_calibration_instance(self.gimbal_controller, auto_init=False)
            print("中位设置模块初始化完成")
        else:
            print("警告: 中位设置模块未初始化")
        
        # 加载时间尺度
        self.ts = load.timescale()
        
        print("卫星跟踪系统初始化完成")
    
    def init_gimbal_controller(self):
        """初始化云台控制器"""
        if BaseController is None:
            print("使用模拟云台控制模式")
            return
        
        try:
            # 检测树莓派型号
            if self.is_raspberry_pi5():
                device = '/dev/ttyAMA0'
            else:
                device = '/dev/serial0'
            
            self.gimbal_controller = BaseController(device, 115200)
            print(f"云台控制器初始化成功: {device}")
        except Exception as e:
            print(f"云台控制器初始化失败: {e}，使用模拟模式")
            self.gimbal_controller = None
    
    def is_raspberry_pi5(self) -> bool:
        """检测是否为树莓派5"""
        try:
            with open('/proc/cpuinfo', 'r') as file:
                for line in file:
                    if 'Model' in line:
                        return 'Raspberry Pi 5' in line
        except FileNotFoundError:
            pass
        return False
    
    def load_satellite_from_tle(self, satellite_data: Dict):
        """从TLE数据加载单个卫星"""
        try:
            print(f"[DEBUG] 开始加载卫星TLE数据: {satellite_data.get('name', 'Unknown')}")
            
            name = satellite_data['name']
            line1 = satellite_data['line1']
            line2 = satellite_data['line2']
            
            print(f"[DEBUG] TLE数据 - 名称: {name}")
            print(f"[DEBUG] TLE数据 - Line1: {line1[:20]}...")
            print(f"[DEBUG] TLE数据 - Line2: {line2[:20]}...")
            
            # 验证TLE格式
            if not (line1.startswith('1 ') and line2.startswith('2 ')):
                print(f"[ERROR] TLE格式验证失败 - Line1: {line1[:10]}, Line2: {line2[:10]}")
                raise ValueError("无效的TLE格式")
            
            print(f"[DEBUG] TLE格式验证通过")
            
            # 使用skyfield加载卫星
            satellite = EarthSatellite(line1, line2, name, self.ts)
            
            print(f"[INFO] 成功加载卫星: {name} (NORAD ID: {satellite_data.get('noradId', 'Unknown')})")
            return satellite
            
        except Exception as e:
            print(f"[ERROR] 加载卫星失败: {str(e)}")
            print(f"[ERROR] 卫星数据: {satellite_data}")
            raise
    
    def calculate_satellite_position(self, satellite, 
                                   ground_station, 
                                   current_time: datetime, 
                                   convert_azimuth: bool = True) -> Tuple[float, float]:
        """计算卫星的方位角和仰角
        
        Args:
            satellite: 卫星对象
            ground_station: 地面站对象
            current_time: 计算时间
            convert_azimuth: 是否转换方位角，True为转换（用于云台控制），False为原始方位角（用于轨迹显示）
        """
        try:
            # 在模拟模式下显示北京时间
            if self.simulation_mode:
                beijing_tz = timezone(timedelta(hours=8))
                beijing_time = current_time.astimezone(beijing_tz)
                # print(f"[DEBUG] 开始计算卫星位置 - UTC时间: {current_time}, 北京时间: {beijing_time}")
            # else:
                # print(f"[DEBUG] 开始计算卫星位置 - 时间: {current_time}")
            
            # 创建时间对象
            t = self.ts.from_datetime(current_time)
            # print(f"[DEBUG] 时间对象创建成功: {t}")
            
            # 计算卫星相对于地面站的位置
            difference = satellite - ground_station
            topocentric = difference.at(t)
            # print(f"[DEBUG] 地心坐标计算完成")
            
            # 获取方位角和仰角
            alt, az, distance = topocentric.altaz()
            
            azimuth = az.degrees
            elevation = alt.degrees
            
            # 根据参数决定是否进行方位角转换
            if convert_azimuth:
                # 预测卫星轨迹方向并进行方位角转换（用于云台控制）
                converted_azimuth, trajectory_direction = self.convert_azimuth_for_gimbal(azimuth, current_time)
                final_azimuth = converted_azimuth
            else:
                # 直接使用原始方位角（用于轨迹显示）
                final_azimuth = azimuth
            
            # 在模拟模式下显示模拟时刻点
            if self.simulation_mode and convert_azimuth:
                beijing_tz = timezone(timedelta(hours=8))
                beijing_time = current_time.astimezone(beijing_tz)
                # print(f"[DEBUG] 位置计算结果 - 模拟时刻: {beijing_time.strftime('%Y-%m-%d %H:%M:%S')} (北京时间) - 原始方位角: {azimuth:.2f}°, 转换后方位角: {final_azimuth:.2f}°, 仰角: {elevation:.2f}°, 距离: {distance.km:.2f}km")
            
            return final_azimuth, elevation
            
        except Exception as e:
            print(f"[ERROR] 计算卫星位置失败: {e}")
            print(f"[ERROR] 输入参数 - 卫星: {satellite}, 时间: {current_time}")
            return 0.0, 0.0
    
    def convert_azimuth_for_gimbal(self, azimuth: float, current_time: datetime) -> tuple[float, str]:
        """根据云台朝向转换方位角"""
        try:
            # 根据云台朝向设置进行转换
            if self.gimbal_direction == "auto":
                # 自动模式：默认云台朝北
                converted_azimuth = azimuth
                if azimuth > 180:
                    converted_azimuth = azimuth - 360
                print(f"[INFO] 自动模式：云台朝北")
            elif self.gimbal_direction == "north":
                # 云台朝北：直接使用原始方位角，但限制在±180度范围内
                converted_azimuth = azimuth
                if azimuth > 180:
                    converted_azimuth = azimuth - 360
            elif self.gimbal_direction == "south":
                # 云台朝南：转换坐标系
                converted_azimuth = azimuth - 180
                if converted_azimuth < -180:
                    converted_azimuth += 360
            else:
                # 默认按朝北处理
                converted_azimuth = azimuth
                if azimuth > 180:
                    converted_azimuth = azimuth - 360
            
            # 检查转换后的角度是否在云台可转动范围内
            if abs(converted_azimuth) > 180:
                print(f"[WARNING] 转换后方位角 {converted_azimuth:.2f}° 超出云台转动范围(±180°)")
            
            return converted_azimuth, "auto"
            
        except Exception as e:
            print(f"[ERROR] 方位角转换失败: {e}")
            return azimuth, "unknown"
    
    def parse_tracking_start_time(self, start_time: str) -> datetime:
        """解析前端传来的强制时间。

        新前端传 UTC ISO；旧前端可能传无时区 datetime-local 字符串，兼容按北京时间处理。
        """
        parsed_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        if parsed_time.tzinfo is None:
            beijing_tz = timezone(timedelta(hours=8))
            parsed_time = parsed_time.replace(tzinfo=beijing_tz)
        return parsed_time.astimezone(timezone.utc)


    
    def control_gimbal(self, azimuth: float, elevation: float, current_time=None, force: bool = False):
        """控制云台指向"""
        # 限制角度范围
        original_azimuth = azimuth
        original_elevation = elevation
        azimuth = max(-180, min(180, azimuth))
        elevation = max(-30, min(90, elevation))
        
        if original_azimuth != azimuth or original_elevation != elevation:
            print(f"[DEBUG] 角度限制调整 - 调整后: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")

        azimuth_delta = abs(azimuth - self.current_azimuth)
        elevation_delta = abs(elevation - self.current_elevation)
        if (
            not force and
            GIMBAL_COMMAND_DEADBAND_DEGREES > 0 and
            azimuth_delta < GIMBAL_COMMAND_DEADBAND_DEGREES and
            elevation_delta < GIMBAL_COMMAND_DEADBAND_DEGREES
        ):
            now = time.time()
            if now - self.last_command_skipped_time >= 5:
                print(
                    f"[DEBUG] 角度变化小于死区 {GIMBAL_COMMAND_DEADBAND_DEGREES:.3f}°，跳过本次云台指令 "
                    f"(Δ方位={azimuth_delta:.3f}°, Δ仰角={elevation_delta:.3f}°)"
                )
                self.last_command_skipped_time = now
            return False

        if self.simulation_mode and current_time:
            beijing_tz = timezone(timedelta(hours=8))
            beijing_time = current_time.astimezone(beijing_tz)
            print(f"[DEBUG] 云台控制请求 - 强制时间: {beijing_time.strftime('%Y-%m-%d %H:%M:%S')} (北京时间) - 目标角度: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        else:
            print(f"[DEBUG] 云台控制请求 - 目标角度: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")

        command_accepted = False
        if self.gimbal_controller:
            try:
                print(f"[DEBUG] 发送云台控制指令到硬件设备")
                # 使用base_ctrl.py提供的gimbal_ctrl方法
                # 参数: x(方位角), y(仰角), speed(速度), acceleration(加速度)
                self.gimbal_controller.gimbal_ctrl(
                    azimuth,
                    elevation,
                    GIMBAL_TRACKING_SPEED,
                    GIMBAL_TRACKING_ACCELERATION
                )
                self.last_control_error = None
                command_accepted = True
                print(f"[INFO] 云台控制指令发送成功: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
            except Exception as e:
                self.last_control_error = str(e)
                print(f"[ERROR] 云台控制失败: {e}")
                print(f"[ERROR] 控制参数: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        else:
            print(f"[INFO] 后端模拟控制: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
            self.last_control_error = None
            command_accepted = True
        
        # 只有命令被接受后才更新后端显示位置；真实位置仍应以硬件反馈为准。
        if command_accepted:
            self.current_azimuth = azimuth
            self.current_elevation = elevation
            print(f"[DEBUG] 当前云台位置已更新: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        return command_accepted

    def park_gimbal_if_needed(self, current_time=None, loop_count: int = 0):
        """卫星不可见时只发送一次归零指令，避免重复刷串口。"""
        already_parked = abs(self.current_azimuth) < 0.01 and abs(self.current_elevation) < 0.01
        if self.last_satellite_visible or not already_parked:
            print(f"[INFO] 卫星不可见，云台归零")
            self.control_gimbal(0, 0, current_time, force=True)
        elif loop_count % 30 == 1:
            print(f"[INFO] 卫星不可见，云台保持零位")

        self.last_satellite_visible = False

    def stop_tracking_for_low_elevation(self, elevation: float, current_time=None) -> bool:
        """Stop tracking only after the pass has climbed above the stop threshold."""
        if elevation >= TRACKING_STOP_ELEVATION:
            if not self.tracking_stop_armed:
                print(
                    f"[INFO] 仰角已达到 {elevation:.2f}°，启用低于 "
                    f"{TRACKING_STOP_ELEVATION:.2f}° 自动停止保护"
                )
            self.tracking_stop_armed = True
            return False

        if not self.tracking_stop_armed:
            return False

        print(
            f"[INFO] 仰角 {elevation:.2f}° 低于停止阈值 "
            f"{TRACKING_STOP_ELEVATION:.2f}°，停止跟踪并复位云台"
        )
        self.tracking_stop_reason = 'low_elevation'
        self.tracking_stop_elevation = elevation
        self.is_tracking = False
        self.last_satellite_visible = False
        self.control_gimbal(0, 0, current_time, force=True)
        return True
    
    def tracking_loop(self):
        """跟踪循环"""
        print(f"[INFO] 开始卫星跟踪循环")
        loop_count = 0
        loop_start_monotonic = time.monotonic()
        
        while self.is_tracking:
            cycle_start_monotonic = time.monotonic()
            try:
                loop_count += 1
                
                # 根据模式选择时间
                if self.simulation_mode:
                    if self.simulation_start_time is not None:
                        elapsed_seconds = cycle_start_monotonic - loop_start_monotonic
                        current_time = self.simulation_start_time + timedelta(seconds=elapsed_seconds)
                        if current_time.tzinfo is None:
                            current_time = current_time.replace(tzinfo=timezone.utc)
                        self.current_simulation_time = current_time
                    else:
                        current_time = datetime.now(timezone.utc)
                else:
                    current_time = datetime.now(timezone.utc)
                
                if loop_count % 10 == 1:  # 每10次循环打印一次详细信息
                    mode_str = "强制时间" if self.simulation_mode else "实时"
                    gimbal_mode_str = "硬件控制" if self.gimbal_controller else "后端模拟"
                    print(f"[DEBUG] 跟踪循环 #{loop_count} - {mode_str}模式, {gimbal_mode_str} - 时间: {current_time}")
                
                # 实时计算卫星位置，而不是依赖预计算的轨迹点
                try:
                    azimuth, elevation = self.calculate_satellite_position(
                        self.current_satellite, 
                        self.ground_station, 
                        current_time, 
                        convert_azimuth=False  # 先获取原始方位角
                    )
                    
                    if self.stop_tracking_for_low_elevation(elevation, current_time):
                        break

                    # 检查卫星是否可见
                    is_visible = elevation > MIN_VISIBLE_ELEVATION
                    
                    if is_visible:
                        print(f"[INFO] 卫星可见，正在跟踪 - 方位角: {azimuth:.2f}°, 仰角: {elevation:.2f}°")
                        
                        # 根据云台朝向转换方位角
                        if self.gimbal_direction == "north":
                            # 云台朝北：方位角大于180度时需要转换
                            if azimuth > 180:
                                azimuth = azimuth - 360
                        elif self.gimbal_direction == "south":
                            # 云台朝南：方位角需要转换180度
                            azimuth = azimuth - 180
                            if azimuth < -180:
                                azimuth += 360
                        
                        # 控制云台跟踪卫星
                        self.control_gimbal(azimuth, elevation, current_time)
                        self.last_satellite_visible = True
                    else:
                        self.park_gimbal_if_needed(current_time, loop_count)
                        
                except Exception as calc_error:
                    print(f"[ERROR] 实时位置计算失败: {calc_error}")
                    # 如果实时计算失败，尝试使用轨迹点作为备选方案
                    is_visible = False
                    matched_trajectory_point = False
                    current_azimuth = 0
                    current_elevation = 0
                    
                    # 在轨迹点中查找当前时间对应的位置
                    for point in self.trajectory_points:
                        point_time = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                        # 将匹配窗口从10秒改为1秒，确保每秒都能匹配到正确的轨迹点
                        if point_time <= current_time <= point_time + timedelta(seconds=1):
                            matched_trajectory_point = True
                            is_visible = point['visible']
                            current_elevation = point['elevation']
                            if is_visible:
                                current_azimuth = point['azimuth']
                            break
                    
                    if matched_trajectory_point and self.stop_tracking_for_low_elevation(current_elevation, current_time):
                        break

                    if is_visible:
                        print(f"[INFO] 使用轨迹点数据 - 方位角: {current_azimuth:.2f}°, 仰角: {current_elevation:.2f}°")
                        
                        # 根据云台朝向转换方位角
                        if self.gimbal_direction == "north":
                            if current_azimuth > 180:
                                current_azimuth = current_azimuth - 360
                        elif self.gimbal_direction == "south":
                            current_azimuth = current_azimuth - 180
                            if current_azimuth < -180:
                                current_azimuth += 360
                        
                        self.control_gimbal(current_azimuth, current_elevation, current_time)
                        self.last_satellite_visible = True
                    else:
                        self.park_gimbal_if_needed(current_time, loop_count)
                
                elapsed = time.monotonic() - cycle_start_monotonic
                time.sleep(max(0.0, TRACKING_UPDATE_INTERVAL - elapsed))
                
            except Exception as e:
                print(f"[ERROR] 跟踪循环错误: {e}")
                print(f"[ERROR] 循环次数: {loop_count}, 时间: {datetime.now(timezone.utc)}")
                elapsed = time.monotonic() - cycle_start_monotonic
                time.sleep(max(0.0, TRACKING_UPDATE_INTERVAL - elapsed))
        
        print(f"[INFO] 卫星跟踪循环结束 - 总循环次数: {loop_count}")
    
    def start_tracking(self, satellite_data: Dict, ground_station: Dict, 
                      simulation_mode: bool = False, start_time: Optional[str] = None,
                      gimbal_direction: str = "auto", trajectory_points: List[Dict] = None):
        """开始跟踪"""
        print(f"[INFO] 收到开始跟踪请求")
        print(f"[DEBUG] 跟踪参数 - 卫星: {satellite_data.get('name', 'Unknown')}, 强制时间模式: {simulation_mode}")
        print(f"[DEBUG] 地面站参数: 纬度={ground_station.get('latitude')}, 经度={ground_station.get('longitude')}, 高度={ground_station.get('altitude')}m")
        
        if self.is_tracking:
            print(f"[WARNING] 检测到正在进行的跟踪任务，正在停止当前任务...")
            self.stop_tracking()
            print(f"[INFO] 已停止当前跟踪任务，开始新的跟踪任务")
        
        print(f"[DEBUG] 开始加载卫星TLE数据")
        # 从TLE数据加载卫星
        satellite = self.load_satellite_from_tle(satellite_data)
        
        print(f"[DEBUG] 设置地面站位置")
        # 设置地面站
        self.ground_station = wgs84.latlon(
            ground_station['latitude'],
            ground_station['longitude'],
            elevation_m=ground_station['altitude']
        )
        print(f"[DEBUG] 地面站设置完成: {self.ground_station}")
        
        self.current_satellite = satellite
        self.simulation_mode = simulation_mode
        self.gimbal_direction = gimbal_direction
        self.trajectory_points = trajectory_points or []  # 保存轨迹点数据
        self.last_satellite_visible = False
        self.last_control_error = None
        self.last_command_skipped_time = 0.0
        self.tracking_stop_reason = None
        self.tracking_stop_elevation = None
        self.tracking_stop_armed = False
        print(f"[DEBUG] 云台朝向设置: {gimbal_direction}")
        
        if simulation_mode and start_time:
            self.simulation_start_time = self.parse_tracking_start_time(start_time)
            beijing_tz = timezone(timedelta(hours=8))
            print(f"[DEBUG] 强制时间模式开始时间 (北京时间): {self.simulation_start_time.astimezone(beijing_tz)}")
            print(f"[DEBUG] 强制时间模式开始时间 (UTC): {self.simulation_start_time}")
        else:
            self.simulation_start_time = datetime.now(timezone.utc)
            print(f"[DEBUG] 实时模式开始时间: {self.simulation_start_time}")
        
        # 云台控制器状态检查
        if not self.gimbal_controller:
            print(f"[WARNING] 云台控制器未初始化，将使用后端模拟控制模式")
            print(f"[INFO] 后端模拟控制模式：计算位置但不发送实际控制指令")
        
        print(f"[DEBUG] 云台控制器状态: {'已连接' if self.gimbal_controller else '后端模拟控制模式'}")
        
        self.is_tracking = True
        
        # 启动跟踪线程
        print(f"[DEBUG] 启动跟踪线程")
        self.tracking_thread = threading.Thread(target=self.tracking_loop)
        self.tracking_thread.daemon = True
        self.tracking_thread.start()
        
        print(f"[INFO] 开始跟踪卫星: {satellite_data['name']} (NORAD ID: {satellite_data.get('noradId', 'Unknown')})")
        print(f"[INFO] 地面站位置: {ground_station}")
        print(f"[INFO] 强制时间模式: {simulation_mode} (前端模拟开关)")
        print(f"[INFO] 跟踪系统启动成功")
    
    def stop_tracking(self):
        """停止跟踪"""
        print(f"[INFO] 收到停止跟踪请求")
        
        if not self.is_tracking:
            print(f"[WARNING] 当前没有正在进行的跟踪任务")
            return
            
        print(f"[DEBUG] 设置跟踪标志为False")
        self.is_tracking = False
        
        # 云台复位
        print(f"[INFO] 云台复位中...")
        try:
            self.control_gimbal(0, 0, force=True)
            self.last_satellite_visible = False
            print(f"[INFO] 云台已复位到零位")
        except Exception as e:
            print(f"[ERROR] 云台复位失败: {e}")
        
        if self.tracking_thread:
            print(f"[DEBUG] 等待跟踪线程结束...")
            self.tracking_thread.join(timeout=2)
            if self.tracking_thread.is_alive():
                print(f"[WARNING] 跟踪线程未能在2秒内正常结束")
            else:
                print(f"[DEBUG] 跟踪线程已正常结束")
            self.tracking_thread = None
        
        print(f"[INFO] 卫星跟踪已停止")
    
    def get_current_position(self) -> Dict:
        """获取当前云台位置"""
        result = {
            'azimuth': self.current_azimuth,
            'elevation': self.current_elevation,
            'is_tracking': self.is_tracking,
            'stop_reason': self.tracking_stop_reason,
            'stop_elevation': self.tracking_stop_elevation,
            'stop_elevation_threshold': TRACKING_STOP_ELEVATION,
            'stop_elevation_armed': self.tracking_stop_armed
        }
        
        # 在强制时间模式下添加当前时间
        if self.simulation_mode and hasattr(self, 'current_simulation_time'):
            result['simulation_time'] = self.current_simulation_time.isoformat()
        
        return result

# 创建全局跟踪器实例
tracker = SatelliteTracker()

@app.route('/')
def index():
    """主页"""
    return send_from_directory('.', 'index.html')

@app.route('/app.js')
def app_js():
    """主应用脚本"""
    return send_from_directory('.', 'app.js')

@app.route('/css/<path:filename>')
def css_files(filename):
    """CSS静态文件"""
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def js_files(filename):
    """JavaScript静态文件"""
    return send_from_directory('js', filename)

# 中位设置页面路由 - 必须在通用静态文件路由之前
@app.route('/calibration')
def calibration_page():
    """中位设置页面"""
    return send_from_directory('.', 'calibration.html')

# 在第495行之前（通用静态文件路由之前）添加所有校准API路由

# 校准相关API路由
@app.route('/api/calibration/torque', methods=['POST'])
@require_api_token
def api_calibration_torque():
    """控制舵机扭矩锁"""
    try:
        if not tracker.calibration:
            return jsonify({
                'success': False,
                'message': '中位设置模块未初始化'
            }), 500
        
        data = request.get_json()
        enable = data.get('enable', True)
        
        result = tracker.calibration.control_torque(enable)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'扭矩锁控制失败: {str(e)}'
        }), 500

@app.route('/api/calibration/set_center', methods=['POST'])
@require_api_token
def api_calibration_set_center():
    """设置舵机中位"""
    try:
        if not tracker.calibration:
            return jsonify({
                'success': False,
                'message': '中位设置模块未初始化'
            }), 500
        
        result = tracker.calibration.set_center_position()
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'中位设置失败: {str(e)}'
        }), 500

@app.route('/api/calibration/test', methods=['POST'])
@require_api_token
def api_calibration_test():
    """测试校准"""
    try:
        if not tracker.calibration:
            return jsonify({
                'success': False,
                'message': '中位设置模块未初始化'
            }), 500
        
        data = request.get_json()
        azimuth = data.get('azimuth', 0)
        elevation = data.get('elevation', 0)
        
        result = tracker.calibration.test_movement(azimuth, elevation)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'测试失败: {str(e)}'
        }), 500

# 星历由后端下载和缓存，前端仍只把选中的单颗卫星TLE发给跟踪接口

@app.route('/api/constellations')
def api_constellations():
    """获取后端支持的星座列表"""
    return jsonify({
        'constellations': [
            {
                'id': constellation,
                'label': CONSTELLATION_LABELS.get(constellation, constellation.upper())
            }
            for constellation in CONSTELLATION_URLS.keys()
        ],
        'ids': list(CONSTELLATION_URLS.keys())
    })

@app.route('/api/ephemeris/<constellation>')
def api_ephemeris(constellation):
    """从后端缓存获取星历数据"""
    try:
        force_refresh = request.args.get('refresh') in {'1', 'true', 'yes'}
        result = load_tle_text(constellation, force_refresh)
        return jsonify(result)
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        print(f"[API ERROR] 获取星历失败: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/start_tracking', methods=['POST'])
@require_api_token
def api_start_tracking():
    """开始跟踪API"""
    try:
        data = request.get_json()
        
        # 验证必要参数
        if not data:
            print(f"[API ERROR] 请求数据为空")
            return jsonify({'error': '请求数据为空'}), 400
            
        if 'satellite' not in data:
            print(f"[API ERROR] 缺少satellite参数")
            return jsonify({'error': '缺少satellite参数'}), 400
            
        if 'groundStation' not in data:
            print(f"[API ERROR] 缺少groundStation参数")
            return jsonify({'error': '缺少groundStation参数'}), 400
        
        satellite_data = data['satellite']
        ground_station = data['groundStation']
        simulation_mode = data.get('simulationMode', False)
        start_time = data.get('startTime')
        gimbal_direction = data.get('gimbalDirection', 'auto')
        trajectory_points = data.get('trajectoryPoints', [])  # 获取轨迹点数据
        
        tracker.start_tracking(
            satellite_data, 
            ground_station, 
            simulation_mode, 
            start_time,
            gimbal_direction,
            trajectory_points  # 传递轨迹点数据
        )
        
        response = {'success': True, 'message': '跟踪已开始'}
        return jsonify(response)
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 处理失败: {error_msg}")
        print(f"[API ERROR] 请求数据: {request.get_json() if request.get_json() else 'None'}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/stop_tracking', methods=['POST'])
@require_api_token
def api_stop_tracking():
    """停止跟踪API"""
    # print(f"[API] 收到POST请求: /api/stop_tracking")
    try:
        tracker.stop_tracking()
        response = {'success': True, 'message': '跟踪已停止'}
        # print(f"[API] 停止跟踪成功: {response}")
        return jsonify(response)
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 停止跟踪失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/gimbal_status')
def api_gimbal_status():
    """获取云台状态API"""
    try:
        # 检查云台控制器是否已初始化
        initialized = tracker.gimbal_controller is not None
        controller_status = {}
        if tracker.gimbal_controller and hasattr(tracker.gimbal_controller, 'get_status'):
            controller_status = tracker.gimbal_controller.get_status()
        
        # 返回前端期望的状态格式
        if initialized and controller_status.get('connected', True):
            status = 'success'
        else:
            status = 'disconnected'
            
        return jsonify({
            'status': status,
            'initialized': initialized,
            'simulation_mode': not initialized,
            'controller': controller_status,
            'last_control_error': tracker.last_control_error
        })
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 获取云台状态失败: {error_msg}")
        return jsonify({
            'status': 'error',
            'error': error_msg
        }), 500

@app.route('/api/get_current_position')
def api_get_current_position():
    """获取当前位置API"""
    # print(f"[API] 收到GET请求: /api/get_current_position")
    try:
        position = tracker.get_current_position()
        # print(f"[API] 当前位置查询成功: {position}")
        return jsonify(position)
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 获取当前位置失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/calculate_position', methods=['POST'])
def api_calculate_position():
    """计算卫星位置API"""
    # print(f"[API] 收到POST请求: /api/calculate_position")
    try:
        data = request.get_json()
        # print(f"[API] 位置计算请求数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # 验证必要参数
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
            
        if 'satellite' not in data:
            return jsonify({'error': '缺少satellite参数'}), 400
            
        if 'groundStation' not in data:
            return jsonify({'error': '缺少groundStation参数'}), 400
            
        if 'time' not in data:
            return jsonify({'error': '缺少time参数'}), 400
        
        satellite_data = data['satellite']
        ground_station_data = data['groundStation']
        time_str = data['time']
        
        # 解析时间
        current_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
        
        # 创建地面站
        ground_station = wgs84.latlon(
            ground_station_data['latitude'], 
            ground_station_data['longitude'], 
            ground_station_data.get('altitude', 0)
        )
        
        # 加载卫星
        satellite = tracker.load_satellite_from_tle(satellite_data)
        
        # 计算位置
        azimuth, elevation = tracker.calculate_satellite_position(
            satellite, ground_station, current_time
        )
        
        result = {
            'azimuth': azimuth,
            'elevation': elevation,
            'time': time_str
        }
        
        # print(f"[API] 位置计算成功: {result}")
        return jsonify(result)
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 位置计算失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

def find_pass_candidates_fast(satellite, ground_station, start_time, search_hours=24):
    """快速搜索过境候选时间段"""
    candidates = []
    current_time = start_time
    end_time = start_time + timedelta(hours=search_hours)
    
    # 首先检查起始时间的卫星仰角
    try:
        initial_azimuth, initial_elevation = tracker.calculate_satellite_position(
            satellite, ground_station, start_time, convert_azimuth=False
        )
        
        # 如果起始时间卫星已经升起，将其作为第一个候选时间段
        if initial_elevation > 0:
            # 向前回溯寻找过境开始，向后延伸寻找过境结束
            pass_start = start_time - timedelta(minutes=30)
            pass_end = start_time + timedelta(minutes=30)
            candidates.append((pass_start, pass_end))
            print(f"[DEBUG] 检测到起始时间卫星已升起，仰角: {initial_elevation:.2f}°")
            
            # 从起始时间+30分钟开始继续搜索后续过境
            current_time = start_time + timedelta(minutes=30)
    except Exception as e:
        print(f"[DEBUG] 检查起始时间失败: {e}")
    
    # 粗搜索：3分钟间隔快速扫描
    coarse_step = timedelta(minutes=3)
    prev_elevation = None
    
    while current_time <= end_time:
        try:
            azimuth, elevation = tracker.calculate_satellite_position(
                satellite, ground_station, current_time, convert_azimuth=False
            )
            
            # 检测仰角变化趋势，寻找过境时间段
            if prev_elevation is not None:
                # 如果仰角从负变正或者当前仰角>10度，可能是过境开始
                if (prev_elevation <= 0 and elevation > 0) or elevation > 10:
                    # 向前回溯寻找过境开始
                    pass_start = current_time - timedelta(minutes=15)
                    pass_end = current_time + timedelta(minutes=15)
                    candidates.append((pass_start, pass_end))
                    
                    # 跳过这个过境时间段，避免重复检测
                    current_time += timedelta(minutes=20)
                    prev_elevation = None
                    continue
            
            prev_elevation = elevation
            current_time += coarse_step
            
        except Exception as e:
            current_time += coarse_step
            continue
    
    return candidates

def calculate_detailed_pass(satellite, ground_station, start_time, end_time):
    """计算详细过境轨迹"""
    trajectory_points = []
    current_time = start_time
    time_step = timedelta(seconds=1)
    
    # 批量计算时间点
    time_points = []
    temp_time = current_time
    while temp_time <= end_time:
        time_points.append(temp_time)
        temp_time += time_step
    
    # 批量计算位置（利用skyfield的向量化能力）
    try:
        ts = tracker.ts
        t_array = ts.from_datetimes(time_points)
        difference = satellite - ground_station
        topocentric = difference.at(t_array)
        alt, az, distance = topocentric.altaz()
        
        # 构建结果点
        for i, time_point in enumerate(time_points):
            azimuth = az.degrees[i] if hasattr(az.degrees, '__len__') else az.degrees
            elevation = alt.degrees[i] if hasattr(alt.degrees, '__len__') else alt.degrees
            
            is_visible = bool(elevation > MIN_VISIBLE_ELEVATION)
            
            point = {
                'time': time_point.isoformat(),
                'azimuth': round(float(azimuth), 3),
                'elevation': round(float(elevation), 3),
                'visible': is_visible
            }
            trajectory_points.append(point)
            
    except Exception as e:
        # 如果批量计算失败，回退到逐点计算
        print(f"[DEBUG] 批量计算失败，回退到逐点计算: {e}")
        for time_point in time_points:
            try:
                azimuth, elevation = tracker.calculate_satellite_position(
                    satellite, ground_station, time_point, convert_azimuth=False
                )
                
                is_visible = bool(elevation > MIN_VISIBLE_ELEVATION)
                
                point = {
                    'time': time_point.isoformat(),
                    'azimuth': round(azimuth, 3),
                    'elevation': round(elevation, 3),
                    'visible': is_visible
                }
                trajectory_points.append(point)
                
            except Exception as e2:
                continue
    
    return trajectory_points

@app.route('/api/calculate_trajectory', methods=['POST'])
def api_calculate_trajectory():
    """计算卫星轨迹API - 优化版本"""
    try:
        data = request.get_json()
        
        # 验证必要参数
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
            
        if 'satellite' not in data:
            return jsonify({'error': '缺少satellite参数'}), 400
            
        if 'groundStation' not in data:
            return jsonify({'error': '缺少groundStation参数'}), 400
            
        if 'startTime' not in data:
            return jsonify({'error': '缺少startTime参数'}), 400
        
        satellite_data = data['satellite']
        ground_station_data = data['groundStation']
        start_time_str = data['startTime']
        
        # 解析起始时间
        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        
        # 创建地面站
        ground_station = wgs84.latlon(
            ground_station_data['latitude'], 
            ground_station_data['longitude'], 
            ground_station_data.get('altitude', 0)
        )
        
        # 加载卫星
        satellite = tracker.load_satellite_from_tle(satellite_data)
        
        print(f"[API] 开始快速搜索过境候选时间段")
        
        # 第一步：快速搜索过境候选时间段
        candidates = find_pass_candidates_fast(satellite, ground_station, start_time, 24)
        
        if not candidates:
            print(f"[API] 未找到过境候选时间段")
            return jsonify({'error': '在24小时内未找到过境候选时间段'}), 404
        
        print(f"[API] 找到 {len(candidates)} 个过境候选时间段")
        
        # 第二步：对每个候选时间段进行详细计算
        for i, (pass_start, pass_end) in enumerate(candidates):
            print(f"[API] 计算候选时间段 {i+1}/{len(candidates)}: {pass_start} - {pass_end}")
            
            # 计算详细轨迹
            trajectory_points = calculate_detailed_pass(satellite, ground_station, pass_start, pass_end)
            
            if not trajectory_points:
                continue
            
            # 提取可见点并检查最大仰角
            visible_points = [p for p in trajectory_points if p['visible']]
            
            if not visible_points:
                continue
                
            max_elevation = max(p['elevation'] for p in visible_points)
            
            if max_elevation >= MIN_PASS_MAX_ELEVATION:
                # 找到符合条件的过境事件
                print(f"[API] 找到符合条件的过境事件: 最大仰角 {max_elevation:.2f}°")
                
                # 保存轨迹数据供跟踪使用
                tracker.trajectory_points = trajectory_points
                
                result = {
                    'trajectoryPoints': trajectory_points,  # 返回所有轨迹点（包括不可见点）
                    'visiblePoints': visible_points,       # 仅可见点
                    'totalPoints': len(trajectory_points),
                    'visibleCount': len(visible_points),
                    'maxElevation': round(max_elevation, 2),
                    'startTime': trajectory_points[0]['time'],      # 使用完整轨迹的开始时间
                    'endTime': trajectory_points[-1]['time'],       # 使用完整轨迹的结束时间
                    'actualStartTime': visible_points[0]['time']    # 可见部分的开始时间
                }
                
                return jsonify(result)
        
        print(f"[API] 所有候选时间段的最大仰角都小于{MIN_PASS_MAX_ELEVATION}°")
        return jsonify({'error': f'在24小时内未找到最大仰角>={MIN_PASS_MAX_ELEVATION}°的轨迹'}), 404
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 轨迹计算失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

# 通用静态文件路由保持在所有明确路由之后。
@app.route('/<path:filename>')
def static_files(filename):
    """只允许访问明确暴露的静态资源，避免泄露.env等项目文件"""
    if filename in ALLOWED_STATIC_FILES:
        return send_from_directory('.', filename)

    parts = filename.split('/', 1)
    if len(parts) == 2 and parts[0] in ALLOWED_STATIC_DIRS:
        return send_from_directory(parts[0], parts[1])

    abort(404)

if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = get_int_env('PORT', 15000)
    print("启动卫星跟踪云台控制系统...")
    print(f"访问地址: http://localhost:{port}")
    app.run(host=host, port=port, debug=False)
