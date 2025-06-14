#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
import math

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from skyfield.api import load, Topos, utc, wgs84
from skyfield.sgp4lib import EarthSatellite
import numpy as np

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

app = Flask(__name__)
CORS(app)

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
        
        # 后端不再需要星座URL配置，由前端负责下载
        
        # 初始化云台控制器
        self.init_gimbal_controller()
        
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
                converted_azimuth = azimuth
            
            # 检查转换后的角度是否在云台可转动范围内
            if abs(converted_azimuth) > 180:
                print(f"[WARNING] 转换后方位角 {converted_azimuth:.2f}° 超出云台转动范围(±180°)")
            
            return converted_azimuth, "auto"
            
        except Exception as e:
            print(f"[ERROR] 方位角转换失败: {e}")
            return azimuth, "unknown"
    

    
    def control_gimbal(self, azimuth: float, elevation: float, current_time=None):
        """控制云台指向"""
        if self.simulation_mode and current_time:
            beijing_tz = timezone(timedelta(hours=8))
            beijing_time = current_time.astimezone(beijing_tz)
            print(f"[DEBUG] 云台控制请求 - 强制时间: {beijing_time.strftime('%Y-%m-%d %H:%M:%S')} (北京时间) - 原始角度: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        else:
            print(f"[DEBUG] 云台控制请求 - 原始角度: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        
        # 限制角度范围
        original_azimuth = azimuth
        original_elevation = elevation
        azimuth = max(-180, min(180, azimuth))
        elevation = max(-30, min(90, elevation))
        
        if original_azimuth != azimuth or original_elevation != elevation:
            print(f"[DEBUG] 角度限制调整 - 调整后: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")

        if self.gimbal_controller:
            try:
                print(f"[DEBUG] 发送云台控制指令到硬件设备")
                # 使用base_ctrl.py提供的gimbal_ctrl方法
                # 参数: x(方位角), y(仰角), speed(速度), acceleration(加速度)
                self.gimbal_controller.gimbal_ctrl(azimuth, elevation, 10, 0)
                print(f"[INFO] 云台控制指令发送成功: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
            except Exception as e:
                print(f"[ERROR] 云台控制失败: {e}")
                print(f"[ERROR] 控制参数: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        else:
            print(f"[INFO] 后端模拟控制: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
        
        # 更新当前位置
        self.current_azimuth = azimuth
        self.current_elevation = elevation
        print(f"[DEBUG] 当前云台位置已更新: 方位角={azimuth:.2f}°, 仰角={elevation:.2f}°")
    
    def tracking_loop(self):
        """跟踪循环"""
        print(f"[INFO] 开始卫星跟踪循环")
        loop_count = 0
        
        while self.is_tracking:
            try:
                loop_count += 1
                
                # 根据模式选择时间
                if self.simulation_mode:
                    # 强制时间模式：使用前端设置的开始时间加上循环次数作为时间偏移
                    # 这样可以模拟任意时间点的卫星位置
                    if self.simulation_start_time is not None:
                        current_time = self.simulation_start_time + timedelta(seconds=loop_count)
                        # 确保时间对象包含时区信息
                        if current_time.tzinfo is None:
                            current_time = current_time.replace(tzinfo=timezone.utc)
                        # 保存当前模拟时间供API使用
                        self.current_simulation_time = current_time
                    else:
                        current_time = datetime.now(timezone.utc)
                else:
                    # 实时模式：使用当前系统时间
                    current_time = datetime.now(timezone.utc)
                
                if loop_count % 10 == 1:  # 每10次循环打印一次详细信息
                    mode_str = "强制时间" if self.simulation_mode else "实时"
                    gimbal_mode_str = "硬件控制" if self.gimbal_controller else "后端模拟"
                    print(f"[DEBUG] 跟踪循环 #{loop_count} - {mode_str}模式, {gimbal_mode_str} - 时间: {current_time}")
                
                # 计算卫星位置
                azimuth, elevation = self.calculate_satellite_position(
                    self.current_satellite,
                    self.ground_station,
                    current_time
                )
                
                # 控制云台
                self.control_gimbal(azimuth, elevation, current_time)
                
                # 等待1秒
                time.sleep(1)
                
            except Exception as e:
                print(f"[ERROR] 跟踪循环错误: {e}")
                print(f"[ERROR] 循环次数: {loop_count}, 时间: {datetime.now(timezone.utc)}")
                time.sleep(1)
        
        print(f"[INFO] 卫星跟踪循环结束 - 总循环次数: {loop_count}")
    
    def start_tracking(self, satellite_data: Dict, ground_station: Dict, 
                      simulation_mode: bool = False, start_time: Optional[str] = None,
                      gimbal_direction: str = "auto"):
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
        print(f"[DEBUG] 云台朝向设置: {gimbal_direction}")
        
        if simulation_mode and start_time:
            # 前端传递的是北京时间，需要转换为UTC时间
            # 解析时间字符串（假设是北京时间）
            parsed_time = datetime.fromisoformat(start_time.replace('Z', ''))
            # 设置为北京时间（UTC+8）
            beijing_tz = timezone(timedelta(hours=8))
            beijing_time = parsed_time.replace(tzinfo=beijing_tz)
            # 转换为UTC时间
            self.simulation_start_time = beijing_time.astimezone(timezone.utc)
            print(f"[DEBUG] 强制时间模式开始时间 (北京时间): {beijing_time}")
            print(f"[DEBUG] 强制时间模式开始时间 (UTC): {self.simulation_start_time}")
        else:
            self.simulation_start_time = datetime.now(timezone.utc)
            print(f"[DEBUG] 实时模式开始时间: {self.simulation_start_time}")
        
        # 云台控制器状态检查
        # 注意：前端的模拟开关只是强制时间模式，不影响云台控制
        # 只有当云台控制器初始化失败时才进入后端模拟控制状态
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
            'is_tracking': self.is_tracking
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

@app.route('/<path:filename>')
def static_files(filename):
    """静态文件"""
    return send_from_directory('.', filename)

# 移除星历下载接口，改为接收前端传来的星历数据

@app.route('/api/start_tracking', methods=['POST'])
def api_start_tracking():
    """开始跟踪API"""
    # print(f"[API] 收到POST请求: /api/start_tracking")
    try:
        data = request.get_json()
        # print(f"[API] 请求数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
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
        
        # print(f"[API] 解析参数完成 - 卫星: {satellite_data.get('name', 'Unknown')}, 模拟模式: {simulation_mode}, 云台朝向: {gimbal_direction}")
        
        tracker.start_tracking(
            satellite_data, 
            ground_station, 
            simulation_mode, 
            start_time,
            gimbal_direction
        )
        
        response = {'success': True, 'message': '跟踪已开始'}
        # print(f"[API] 响应成功: {response}")
        return jsonify(response)
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 处理失败: {error_msg}")
        print(f"[API ERROR] 请求数据: {request.get_json() if request.get_json() else 'None'}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/stop_tracking', methods=['POST'])
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
        return jsonify({
            'initialized': initialized,
            'simulation_mode': not initialized
        })
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 获取云台状态失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

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
    time_step = timedelta(seconds=10)
    
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
            
            is_visible = bool(elevation > 5)
            
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
                
                is_visible = bool(elevation > 5)
                
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
            
            if max_elevation >= 30.0:
                # 找到符合条件的过境事件
                print(f"[API] 找到符合条件的过境事件: 最大仰角 {max_elevation:.2f}°")
                
                result = {
                    'trajectoryPoints': visible_points,
                    'visiblePoints': visible_points,
                    'totalPoints': len(visible_points),
                    'visibleCount': len(visible_points),
                    'maxElevation': round(max_elevation, 2),
                    'startTime': visible_points[0]['time'],
                    'endTime': visible_points[-1]['time'],
                    'actualStartTime': visible_points[0]['time']
                }
                
                return jsonify(result)
        
        print(f"[API] 所有候选时间段的最大仰角都小于30°")
        return jsonify({'error': '在24小时内未找到最大仰角>=30°的轨迹'}), 404
    
    except Exception as e:
        error_msg = str(e)
        print(f"[API ERROR] 轨迹计算失败: {error_msg}")
        return jsonify({'error': error_msg}), 500

if __name__ == '__main__':
    print("启动卫星跟踪云台控制系统...")
    print("访问地址: http://localhost:15000")
    app.run(host='0.0.0.0', port=15000, debug=False)
