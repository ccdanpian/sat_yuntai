#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import time
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_cors import CORS

# 导入云台控制模块
try:
    from base_ctrl import BaseController
except ImportError:
    print("警告: base_ctrl模块未找到，将使用模拟模式")
    BaseController = None

app = Flask(__name__)
CORS(app)

class GimbalCalibration:
    def __init__(self):
        self.gimbal_controller = None
        self.init_gimbal_controller()
        
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
    
    def send_command(self, command_data):
        """发送命令到云台"""
        if self.gimbal_controller:
            try:
                self.gimbal_controller.send_command(command_data)
                return {"success": True, "message": "命令发送成功"}
            except Exception as e:
                return {"success": False, "message": f"命令发送失败: {e}"}
        else:
            print(f"模拟模式 - 发送命令: {command_data}")
            return {"success": True, "message": "模拟模式 - 命令发送成功"}

# 创建全局实例
calibration = GimbalCalibration()

@app.route('/')
def index():
    """返回中位设置页面"""
    return send_from_directory('.', 'calibration.html')

@app.route('/api/torque_lock', methods=['POST'])
def torque_lock():
    """控制舵机扭矩锁"""
    try:
        data = request.get_json()
        cmd = data.get('cmd', 0)  # 0关闭，1开启
        
        # 发送扭矩锁控制命令
        command = {"T": 210, "cmd": cmd}
        result = calibration.send_command(command)
        
        return jsonify({
            "success": result["success"],
            "message": f"扭矩锁{'开启' if cmd else '关闭'}命令已发送",
            "command": command
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"扭矩锁控制失败: {e}"}), 500

@app.route('/api/set_middle', methods=['POST'])
def set_middle():
    """设置舵机中位"""
    try:
        data = request.get_json()
        servo_id = data.get('id', 1)  # 1为倾斜舵机，2为水平舵机
        
        # 发送设置中位命令
        command = {"T": 502, "id": servo_id}
        result = calibration.send_command(command)
        
        servo_name = "倾斜舵机" if servo_id == 1 else "水平舵机"
        return jsonify({
            "success": result["success"],
            "message": f"{servo_name}中位设置命令已发送",
            "command": command
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"中位设置失败: {e}"}), 500

@app.route('/api/gimbal_control', methods=['POST'])
def gimbal_control():
    """云台控制"""
    try:
        data = request.get_json()
        x = data.get('x', 0)
        y = data.get('y', 0)
        speed = data.get('speed', 0)
        acc = data.get('acc', 0)
        
        # 发送云台控制命令
        command = {"T": 133, "X": x, "Y": y, "SPD": speed, "ACC": acc}
        result = calibration.send_command(command)
        
        return jsonify({
            "success": result["success"],
            "message": f"云台控制命令已发送 - X:{x}°, Y:{y}°",
            "command": command
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"云台控制失败: {e}"}), 500

@app.route('/api/test_calibration', methods=['POST'])
def test_calibration():
    """测试校准结果"""
    try:
        # 发送归零命令测试
        command = {"T": 133, "X": 0, "Y": 0, "SPD": 0, "ACC": 0}
        result = calibration.send_command(command)
        
        return jsonify({
            "success": result["success"],
            "message": "校准测试命令已发送，请观察云台是否回到中位",
            "command": command
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"校准测试失败: {e}"}), 500

if __name__ == '__main__':
    print("云台中位设置服务启动中...")
    print("访问地址: http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)