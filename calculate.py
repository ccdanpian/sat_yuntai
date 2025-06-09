# calculate.py

from flask import Blueprint, request, jsonify
from skyfield.api import load, wgs84, EarthSatellite
from datetime import datetime, timedelta
import numpy as np
from tle import load_tle_data, get_satellite_names
import logging
from math import sin, cos, sqrt
from functools import wraps

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

calculate_app = Blueprint('calculate', __name__)

# 全局变量
satellites = load_tle_data()
ts = load.timescale()

# 全局缓存字典，键为星座名称，值为(卫星数据, 时间戳)元组
satellite_cache = {}

# 全局变量用于存储当前的计算进度
current_progress = {
    "percentage": 0,
    "status": "未开始"
}

def cache_satellites(func):
    @wraps(func)
    def wrapper(constellation):
        current_time = datetime.now()
        if constellation in satellite_cache:
            satellites, timestamp = satellite_cache[constellation]
            # 检查是否是同一天
            if current_time.date() == timestamp.date():
                logging.info(f"使用缓存的 {constellation} 星座数据")
                return satellites
        
        # 如果缓存不存在或不是同一天，重新加载数据
        logging.info(f"重新加载 {constellation} 星座数据")
        satellites = func(constellation)
        satellite_cache[constellation] = (satellites, current_time)
        return satellites
    return wrapper

def calculate_parameters(lat_ue, lon_ue, alt_ue, satellite_name, time_points, interval, frequency_mhz, constellation):
    global ts
    
    # logging.info(f"开始计算参数: 星座 {constellation}, 卫星 {satellite_name}, {len(time_points)} 个时间点")
    
    satellites = load_tle_data(constellation)
    
    if not satellites:
        logging.error(f"无法加载 {constellation} 的 TLE 数据")
        return {"error": f"无法加载 {constellation} 的 TLE 数据"}
    
    satellite = next((sat for sat in satellites if sat.name.strip() == satellite_name.strip()), None)
    if satellite is None:
        logging.error(f"在 {constellation} 星座中未找到卫星 {satellite_name}")
        return {"error": f"在 {constellation} 星座中未找到卫星 {satellite_name}"}
    
    # 创建地面站位置
    ue_location = wgs84.latlon(lat_ue, lon_ue, elevation_m=alt_ue * 1000)
    # logging.info(f"用户位置: {ue_location}")

    results = []
    for i, t in enumerate(time_points):
        t_sf = ts.from_datetime(t)
        # 获取卫星位置
        sat_position = satellite.at(t_sf)
        
        # 获取卫星地面点
        subpoint = sat_position.subpoint()
        lat_sat, lon_sat, alt_sat = subpoint.latitude.degrees, subpoint.longitude.degrees, subpoint.elevation.km
        
        # 计算卫星相对于地站的位置
        difference = sat_position - ue_location.at(t_sf)
        distance = difference.distance().km

        # 计算高度角和方位角
        alt, az, _ = difference.altaz()

        alpha = 90 - alt.degrees
        beta = alt.degrees
        beta_shuiping = 90 - beta

        direction_angle = az.degrees

        # 计算下一个时间点的位置（用于计算相对速度）
        next_t = t + timedelta(seconds=1)
        next_position = satellite.at(ts.from_datetime(next_t))
        next_subpoint = next_position.subpoint()
        next_lat_sat = next_subpoint.latitude.degrees
        next_lon_sat = next_subpoint.longitude.degrees
        next_alt_sat = next_subpoint.elevation.km

        # 计算相对速度和多普勒频移
        relative_velocity, doppler_shift = calculate_doppler(
            lat_ue, lon_ue, alt_ue, 
            lat_sat, lon_sat, alt_sat, 
            next_lat_sat, next_lon_sat, next_alt_sat, 
            frequency_mhz
        )

        result = {
            "time": t.isoformat(),
            "satellite_name": satellite_name,
            "lat_sat": round(lat_sat, 6),
            "lon_sat": round(lon_sat, 6),
            "alt_sat": round(alt_sat, 3),
            "distance": round(distance, 3),
            "alpha": round(alpha, 2),
            "beta": round(beta, 2),
            "beta_shuiping": round(beta_shuiping, 2),
            "direction_angle": round(direction_angle, 2),
            "relative_velocity": round(relative_velocity, 2),
            "doppler_shift": round(doppler_shift, 2)
        }
        results.append(result)

        # if i % 10 == 0:  # 每10个点记录一次日志，避免日志过多
        #   logging.info(f"计算进度: {i+1}/{len(time_points)}, 时间: {t}, 距离: {distance:.2f}km")

    # logging.info(f"参数计算完成，共 {len(results)} 个结果")
    return results

def calculate_relative_velocity(satellite, ue_location, t):
    sat_position = satellite.at(t)
    ue_position = ue_location.at(t)
    
    sat_velocity = sat_position.velocity.km_per_s
    ue_velocity = ue_position.velocity.km_per_s
    
    relative_velocity = sat_velocity - ue_velocity
    return np.linalg.norm(relative_velocity)

def to_cartesian_coordinates(r, h, lat, lon):
    R = r + h  
    x = R * cos(lat) * cos(lon)
    y = R * cos(lat) * sin(lon)
    z = R * sin(lat)
    return x, y, z

def cartesian_distance(r, h, lat1, lon1, lat2, lon2):
    x1, y1, z1 = to_cartesian_coordinates(r, 0, lat1, lon1)  
    x2, y2, z2 = to_cartesian_coordinates(r, h, lat2, lon2)  
    D = sqrt((x2 - x1)**2 + (y2 - y1)**2 + (z2 - z1)**2)
    return D

def calculate_doppler(lat_ue, lon_ue, alt_ue, lat_sat1, lon_sat1, alt_sat1, lat_sat2, lon_sat2, alt_sat2, frequency_mhz):
    # 将频率从 MHz 转换为 Hz
    frequency_hz = frequency_mhz * 1e6

    # 计算两个时刻的距离
    D1 = cartesian_distance(6371, alt_sat1, np.radians(lat_ue), np.radians(lon_ue), np.radians(lat_sat1), np.radians(lon_sat1))
    D2 = cartesian_distance(6371, alt_sat2, np.radians(lat_ue), np.radians(lon_ue), np.radians(lat_sat2), np.radians(lon_sat2))
    
    # 计算相对速度（1秒内的位移）
    v_relative = -1000 * (D2 - D1)  # 转换为 m/s
    
    # 计算多普勒频移
    c = 299792458  # 光速，单位：m/s
    doppler_shift = (v_relative / c) * frequency_hz
    
    return v_relative, doppler_shift

def search_target_satellite(lat_ue, lon_ue, alt_ue, satellite_name, start_time, end_time, interval, lat_error, lon_error, show_cover):
    ts = load.timescale()
    satellites = load.tle_file('satellite.tle')
    satellite = next((sat for sat in satellites if sat.name == satellite_name), None)
    
    if not satellite:
        return {"error": "卫星未找到"}

    results = []
    current_time = start_time
    
    while current_time <= end_time:
        t = ts.from_datetime(current_time)
        geocentric = satellite.at(t)
        subpoint = wgs84.subpoint(geocentric)
        
        lat_sat = subpoint.latitude.degrees
        lon_sat = subpoint.longitude.degrees
        alt_sat = subpoint.elevation.km
        
        # 检查卫星是否在允许的误差范围内
        if (abs(lat_sat - lat_ue) <= lat_error) and (abs(lon_sat - lon_ue) <= lon_error):
            # 计算其他参数
            distance, alpha, beta, beta_shuiping = calculate_parameters(lat_ue, lon_ue, alt_ue, lat_sat, lon_sat, alt_sat)
            direction_angle = calculate_direction_angle(lat_ue, lon_ue, lat_sat, lon_sat)
            relative_velocity, doppler_shift = calculate_doppler(satellite, t, lat_ue, lon_ue, alt_ue)
            
            results.append({
                "time": current_time.isoformat(),
                "lat_sat": lat_sat,
                "lon_sat": lon_sat,
                "alt_sat": alt_sat,
                "distance": distance,
                "alpha": alpha,
                "beta": beta,
                "beta_shuiping": beta_shuiping,
                "direction_angle": direction_angle,
                "relative_velocity": relative_velocity,
                "doppler_shift": doppler_shift
            })
        
        current_time += timedelta(seconds=interval)
    
    if show_cover:
        coverage = calculate_coverage(satellite, start_time, lat_ue, lon_ue)
        return {"results": results, "coverage": coverage}
    else:
        return {"results": results}

def calculate_coverage(satellite, time, lat_ue, lon_ue):
    ts = load.timescale()
    t = ts.from_datetime(time)
    geocentric = satellite.at(t)
    subpoint = wgs84.subpoint(geocentric)
    
    # 假设卫星覆盖范围为地球表面的一个圆
    # 这里使用一个简化的模型，实际情况可更复杂
    coverage_radius = 2000  # 假设覆盖半径为2000km
    
    coverage_points = []
    for angle in np.linspace(0, 2*np.pi, 100):
        lat = subpoint.latitude.degrees + np.cos(angle) * (coverage_radius / 111)  # 1度约等于111km
        lon = subpoint.longitude.degrees + np.sin(angle) * (coverage_radius / (111 * np.cos(np.radians(subpoint.latitude.degrees))))
        coverage_points.append({"lat": lat, "lon": lon})
    
    return coverage_points

def find_satellite(satellites, lat_ue, lon_ue, alt_ue, delta_lat, delta_lon, start_time, end_time, search_interval, lat_error, lon_error):
    target_lat = lat_ue + delta_lat
    target_lon = lon_ue + delta_lon

    for satellite in satellites:
        current_time = start_time
        while current_time <= end_time:
            t = ts.from_datetime(current_time)
            geocentric = satellite.at(t)
            subpoint = wgs84.subpoint(geocentric)
            
            lat_sat = subpoint.latitude.degrees
            lon_sat = subpoint.longitude.degrees
            
            if (abs(lat_sat - target_lat) <= lat_error) and (abs(lon_sat - target_lon) <= lon_error):
                return {
                    "satellite": satellite.name.strip(),
                    "time": current_time.isoformat(),
                    "lat_sat": lat_sat,
                    "lon_sat": lon_sat
                }
            
            current_time += timedelta(seconds=search_interval)
    
    return {}  # 如果没有找到满足条件的卫星

@calculate_app.route('/calculate', methods=['POST'])
def calculate():
    global current_progress
    data = request.json
    
    lat_ue = data.get('lat_ue')
    lon_ue = data.get('lon_ue')
    alt_ue = data.get('alt_ue')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    interval = data.get('interval')
    frequency_mhz = data.get('frequency')
    constellation = data.get('constellation', 'IRIDIUM')
    show_all = data.get('show_cover', False)  # 新增参数,用于判断是否计算所有卫星

    # 检查必要字段
    required_fields = ['lat_ue', 'lon_ue', 'alt_ue', 'start_time', 'end_time', 'interval', 'frequency']
    missing_fields = [field for field in required_fields if data.get(field) is None]
    
    if missing_fields:
        error_message = f"缺少必要字段: {', '.join(missing_fields)}"
        logging.error(error_message)
        return jsonify({"error": error_message}), 400

    try:
        # 处理时间点
        start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
        interval_seconds = int(interval)
        
        time_points = []
        current_time = start_time
        while current_time <= end_time:
            time_points.append(current_time)
            current_time += timedelta(seconds=interval_seconds)

        # 获取需要计算的卫星列表
        if show_all:
            satellites = load_tle_data(constellation)
            if not satellites:
                return jsonify({"error": f"无法加载{constellation}星座数据"}), 400
            satellite_names = [sat.name.strip() for sat in satellites]
            logging.info(f"计算所有卫星: {constellation}星座, 共{len(satellite_names)}颗")
        else:
            satellite_name = data.get('satellite_name')
            if not satellite_name:
                return jsonify({"error": "未指定卫星名称"}), 400
            satellite_names = [satellite_name]
            logging.info(f"计算单个卫星: {satellite_names[0]}")

        # 存储所有卫星的计算结果
        all_results = []
        total_satellites = len(satellite_names)
        
        # 对每个卫星进行计算
        for index, sat_name in enumerate(satellite_names):
            try:
                # 更新进度状态
                current_progress["status"] = f"计算卫星 {sat_name}"
                
                results = calculate_parameters(
                    lat_ue, lon_ue, alt_ue,
                    sat_name, time_points,
                    interval_seconds,
                    frequency_mhz,
                    constellation
                )
                
                # 检查计算结果
                if isinstance(results, dict) and 'error' in results:
                    logging.warning(f"计算卫星 {sat_name} 时出错: {results['error']}")
                    continue
                    
                # 为每个结果添加卫星名称
                for result in results:
                    result['satellite_name'] = sat_name
                
                all_results.extend(results)
                
                # 计算并记录进度百分比，保留小数点后1位
                progress_percentage = ((index + 1) / total_satellites) * 100
                current_progress["percentage"] = round(progress_percentage, 1)
                logging.info(f"计算进度: {progress_percentage:.1f}%")

            except Exception as e:
                logging.error(f"处理卫星 {sat_name} 时出错: {str(e)}")
                continue

        # 计算完成后更新状态
        current_progress["status"] = "完成"
        current_progress["percentage"] = 100

        if not all_results:
            return jsonify({"error": "没有有效的计算结果"}), 400

        logging.info(f"计算完成: 共{len(all_results)}个结果")
        return jsonify({"results": all_results})

    except Exception as e:
        error_message = f"计算过程出错: {str(e)}"
        logging.error(error_message)
        current_progress["status"] = "出错"
        return jsonify({"error": error_message}), 500

@calculate_app.route('/get_satellites', methods=['GET'])
def get_satellites():
    global satellites
    if satellites is None:
        satellites = load_tle_data()
    sat_names = get_satellite_names(satellites)
    return jsonify(sat_names)

@calculate_app.route('/search_satellite', methods=['POST'])
def search_satellite():
    data = request.json
    constellation = data.get('constellation', 'IRIDIUM')
    logging.info(f"搜索卫星: 星座 {constellation}")
    
    satellites = load_tle_data(constellation)
    
    if not satellites:
        logging.error(f"无法加载 {constellation} 的 TLE 数据")
        return jsonify({"error": f"无法加载 {constellation} 的 TLE 数据"}), 400

    logging.info(f"成功加载 {constellation} 的 TLE 数据，卫星数量: {len(satellites)}")
    
    result = find_satellite(
        satellites,  # 传递加载的卫星数据
        data['lat_ue'], data['lon_ue'], data['alt_ue'],
        data['delta_lat'], data['delta_lon'],
        datetime.fromisoformat(data['start_time'].replace('Z', '+00:00')),
        datetime.fromisoformat(data['end_time'].replace('Z', '+00:00')),
        data['search_interval'],
        data['lat_error'], data['lon_error']
    )
    
    if result:
        logging.info(f"找到卫星: {result['satellite']}")
    else:
        logging.info("未找到符合条件的卫星")
    
    return jsonify(result)

def clear_satellite_cache(constellation=None):
    global satellite_cache
    if constellation:
        satellite_cache.pop(constellation, None)
        logging.info(f"已清除 {constellation} 星座的缓存")
    else:
        satellite_cache.clear()
        logging.info("已清除所有星座的缓存")

@calculate_app.route('/progress', methods=['GET'])
def get_progress():
    """返回当前的计算进度"""
    return jsonify(current_progress)
