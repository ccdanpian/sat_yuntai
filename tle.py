# tle.py
from flask import Blueprint, request, jsonify
import configparser
from datetime import datetime
import requests
import os
from skyfield.api import load

tle_bp = Blueprint('tle', __name__)

def update_tle_data(constellation=None):
    config = configparser.ConfigParser()
    config.read('config.ini')
    today = datetime.now().date()

    try:
        force_update = config.getboolean('TLE', 'force_update')
        last_update_str = config.get('TLE', 'last_update_date')
        
        if constellation is None:
            constellation = config.get('TLE', 'default_constellation')

        tle_file_name = f"./tle/{constellation}.tle"

        if not config.has_option('TLE', constellation):
            return False, f"未找到星座 {constellation} 的 URL。"

        tle_url = config.get('TLE', constellation)

    except (configparser.NoSectionError, configparser.NoOptionError) as e:
        return False, f"配置错误: {e}"

    should_update = force_update or not os.path.exists(tle_file_name)
    if not should_update and last_update_str:
        last_update = datetime.strptime(last_update_str, '%Y-%m-%d').date()
        should_update = last_update < today

    if should_update:
        try:
            print(f"正在从 {tle_url} 下载 TLE 数据...")
            response = requests.get(tle_url)
            if response.status_code == 200:
                # 根据星座类型选择处理方式
                if constellation == 'starlink':
                    # Starlink 保存完整数据
                    with open(tle_file_name, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    success = True
                    
                    # 同时创建 DTC 过滤版本
                    dtc_file_name = f"./tle/starlink_dtc.tle"
                    from dtc import filter_dtc_satellites_streaming
                    dtc_success = filter_dtc_satellites_streaming(response.text, dtc_file_name)
                    if dtc_success:
                        print(f"DTC 过滤数据已保存到 {dtc_file_name}")
                    
                elif constellation == 'x2':
                    # X2 星座需要特殊过滤
                    from dtc import filter_x2_satellites_streaming
                    success = filter_x2_satellites_streaming(response.text, tle_file_name)
                    
                    if not success:
                        return False, "未找到指定的 X2 卫星数据"
                        
                elif constellation == 'starlink_dtc':
                    # 专门的 DTC 过滤星座
                    from dtc import filter_dtc_satellites_streaming
                    success = filter_dtc_satellites_streaming(response.text, tle_file_name)
                    
                else:
                    # 其他星座直接保存完整数据
                    with open(tle_file_name, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    success = True

                if success:
                    config.set('TLE', 'last_update_date', str(today))
                    with open('config.ini', 'w') as f:
                        config.write(f)

                    print(f"{constellation} 的 TLE 数据已更新。")
                    return True, f"{constellation} 的 TLE 数据已更新。"
                else:
                    return False, f"处理 {constellation} 数据时出错"
            else:
                print(f"TLE 数据更新失败: 状态码 {response.status_code}")
                return False, f"TLE 数据更新失败: 状态码 {response.status_code}"
        except Exception as e:
            print(f"更新 TLE 数据时发生错误: {e}")
            return False, f"更新 TLE 数据时发生错误: {e}"

    print("无需更新 TLE 数据。")
    return True, "无需更新 TLE 数据。"

@tle_bp.route('/update_tle', methods=['POST'])
def update_tle_route():
    data = request.json
    constellation = data.get('constellation')
    success, message = update_tle_data(constellation)
    return jsonify({'success': success, 'message': message})

def load_tle_data(constellation='iridium'):
    """加载TLE数据，如果文件不存在则自动下载"""
    tle_file = f'./tle/{constellation}.tle'
    try:
        # 尝试加载TLE文件
        try:
            satellites = load.tle_file(tle_file)
            if not satellites:  # 如果加载结果为空
                raise FileNotFoundError
            return satellites
        except (FileNotFoundError, OSError):
            # 文件不存在或加载失败时，尝试下载
            print(f"TLE文件 {tle_file} 不存在或加载失败，尝试下载...")
            success, message = update_tle_data(constellation)
            if success:
                # 重新尝试加载
                satellites = load.tle_file(tle_file)
                return satellites
            else:
                print(f"下载TLE数据失败: {message}")
                return None
                
    except Exception as e:
        print(f"加载 {constellation} 的 TLE 数据时出错: {e}")
        return None

def get_satellite_names(satellites):
    if satellites:
        return [sat.name.strip() for sat in satellites]
    return []

@tle_bp.route('/get_constellations', methods=['GET'])
def get_constellations():
    config = configparser.ConfigParser()
    config.read('config.ini')
    constellations = [key for key in config['TLE'] if key not in ['force_update', 'last_update_date', 'default_constellation']]
    return jsonify({'constellations': constellations})

@tle_bp.route('/get_satellite_names', methods=['GET'])
def get_satellite_names_route():
    constellation = request.args.get('constellation', 'iridium')
    satellites = load_tle_data(constellation)
    names = get_satellite_names(satellites)
    return jsonify({'satellite_names': names})
