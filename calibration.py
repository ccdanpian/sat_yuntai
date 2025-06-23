# -*- coding: utf-8 -*-
"""
云台中位设置模块
提供云台舵机中位校准功能
"""

import json
from typing import Dict, Any, Optional

# 导入云台控制模块
try:
    from base_ctrl import BaseController
except ImportError:
    print("警告: base_ctrl模块未找到，将使用模拟模式")
    BaseController = None

class GimbalCalibration:
    """云台中位设置类"""
    
    def __init__(self, gimbal_controller: Optional[BaseController] = None):
        """初始化
        
        Args:
            gimbal_controller: 云台控制器实例，如果为None则尝试自动初始化
        """
        self.gimbal_controller = gimbal_controller
        if self.gimbal_controller is None:
            self._init_gimbal_controller()
    
    def _init_gimbal_controller(self):
        """初始化云台控制器"""
        if BaseController is None:
            print("使用模拟云台控制模式")
            return
        
        try:
            # 检测树莓派型号
            if self._is_raspberry_pi5():
                device = '/dev/ttyAMA0'
            else:
                device = '/dev/serial0'
            
            self.gimbal_controller = BaseController(device, 115200)
            print(f"云台控制器初始化成功: {device}")
        except Exception as e:
            print(f"云台控制器初始化失败: {e}，使用模拟模式")
            self.gimbal_controller = None
    
    def _is_raspberry_pi5(self) -> bool:
        """检测是否为树莓派5"""
        try:
            with open('/proc/cpuinfo', 'r') as file:
                for line in file:
                    if 'Model' in line:
                        return 'Raspberry Pi 5' in line
        except FileNotFoundError:
            pass
        return False
    
    def control_torque(self, enable: bool) -> Dict[str, Any]:
        """控制舵机扭矩锁
        
        Args:
            enable: True为开启扭矩锁，False为关闭扭矩锁
            
        Returns:
            操作结果字典
        """
        try:
            if not self.gimbal_controller:
                return {
                    'success': False,
                    'message': '云台控制器未初始化，使用模拟模式',
                    'simulation': True
                }
            
            # 发送扭矩锁控制命令
            command = {
                "T": 134,  # 舵机扭矩锁控制命令
                "enable": 1 if enable else 0
            }
            
            self.gimbal_controller.send_command(command)
            
            action = "开启" if enable else "关闭"
            return {
                'success': True,
                'message': f'舵机扭矩锁已{action}'
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'扭矩锁控制失败: {str(e)}'
            }
    
    def set_center_position(self) -> Dict[str, Any]:
        """设置舵机中位
        
        Returns:
            操作结果字典
        """
        try:
            if not self.gimbal_controller:
                return {
                    'success': False,
                    'message': '云台控制器未初始化，使用模拟模式',
                    'simulation': True
                }
            
            # 发送设置中位命令
            command = {
                "T": 135,  # 设置舵机中位命令
                "action": "set_center"
            }
            
            self.gimbal_controller.send_command(command)
            
            return {
                'success': True,
                'message': '舵机中位设置成功'
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'中位设置失败: {str(e)}'
            }
    
    def test_movement(self, azimuth: float, elevation: float) -> Dict[str, Any]:
        """测试云台移动
        
        Args:
            azimuth: 方位角
            elevation: 仰角
            
        Returns:
            操作结果字典
        """
        try:
            if not self.gimbal_controller:
                return {
                    'success': False,
                    'message': '云台控制器未初始化，使用模拟模式',
                    'simulation': True
                }
            
            # 角度限制检查
            azimuth = max(-180, min(180, azimuth))
            elevation = max(-90, min(90, elevation))
            
            # 使用云台控制方法
            self.gimbal_controller.gimbal_ctrl(azimuth, elevation, 50, 50)
            
            return {
                'success': True,
                'message': f'云台已移动到 方位角:{azimuth}°, 仰角:{elevation}°'
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'测试失败: {str(e)}'
            }

# 便捷函数
def create_calibration_instance(gimbal_controller: Optional[BaseController] = None) -> GimbalCalibration:
    """创建校准实例
    
    Args:
        gimbal_controller: 可选的云台控制器实例
        
    Returns:
        GimbalCalibration实例
    """
    return GimbalCalibration(gimbal_controller)