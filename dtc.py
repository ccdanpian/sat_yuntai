# dtc.py
# 过滤 DTC 卫星

def filter_dtc_satellites(input_file, output_file):
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        filtered_lines = []
        i = 0
        dtc_count = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 跳过空行
            if not line:
                i += 1
                continue
                
            # 检查是否为卫星名称行且包含 [DTC] 标记
            if '[DTC]' in line:
                name_line = line
                tle1 = None
                tle2 = None
                
                # 查找 TLE 第一行
                j = i + 1
                while j < len(lines):
                    line1 = lines[j].strip()
                    if line1:  # 找到非空行
                        if line1.startswith('1 '):
                            tle1 = line1
                            break
                    j += 1
                
                # 查找 TLE 第二行
                k = j + 1
                while k < len(lines):
                    line2 = lines[k].strip()
                    if line2:  # 找到非空行
                        if line2.startswith('2 '):
                            tle2 = line2
                            break
                    k += 1
                
                # 验证是否找到完整的 TLE 数据
                if tle1 and tle2:
                    filtered_lines.extend([name_line + '\n', tle1 + '\n', tle2 + '\n'])
                    dtc_count += 1
                    print(f"找到 DTC 卫星:")
                    print(f"名称: {name_line}")
                    print(f"TLE1: {tle1}")
                    print(f"TLE2: {tle2}\n")
                    i = k + 1  # 跳到下一组数据
                else:
                    print(f"警告: {name_line} 的 TLE 数据不完整")
                    i += 1
            else:
                i += 1
                
        print(f"总共找到 {dtc_count} 颗 DTC 卫星")
        
        if filtered_lines:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            print(f"数据已写入到 {output_file}")
            return True
        else:
            print("未找到任何 DTC 卫星数据")
            return False
        
    except Exception as e:
        print(f"处理文件时出错：{str(e)}")
        return False

import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

def filter_x2_satellites(input_file, output_file):
    """过滤指定的 X2 卫星"""
    # 从环境变量获取目标卫星名称，如果没有设置则使用默认值
    x2_satellites_env = os.getenv('X2_SATELLITES', 'x2-33686,x2-33675,x2-33655,x2-33608')
    
    # 将环境变量字符串分割成集合
    target_satellites = set(name.strip() for name in x2_satellites_env.split(',') if name.strip())
    
    print(f"目标 X2 卫星: {target_satellites}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        filtered_lines = []
        i = 0
        x2_count = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 跳过空行
            if not line:
                i += 1
                continue
                
            # 检查是否为目标卫星名称行
            satellite_name = line.strip()
            if satellite_name in target_satellites:
                name_line = line
                tle1 = None
                tle2 = None
                
                # 查找 TLE 第一行
                j = i + 1
                while j < len(lines):
                    line1 = lines[j].strip()
                    if line1:  # 找到非空行
                        if line1.startswith('1 '):
                            tle1 = line1
                            break
                    j += 1
                
                # 查找 TLE 第二行
                k = j + 1
                while k < len(lines):
                    line2 = lines[k].strip()
                    if line2:  # 找到非空行
                        if line2.startswith('2 '):
                            tle2 = line2
                            break
                    k += 1
                
                # 验证是否找到完整的 TLE 数据
                if tle1 and tle2:
                    filtered_lines.extend([name_line + '\n', tle1 + '\n', tle2 + '\n'])
                    x2_count += 1
                    print(f"找到 X2 卫星:")
                    print(f"名称: {name_line}")
                    print(f"TLE1: {tle1}")
                    print(f"TLE2: {tle2}\n")
                    i = k + 1  # 跳到下一组数据
                else:
                    print(f"警告: {name_line} 的 TLE 数据不完整")
                    i += 1
            else:
                i += 1
                
        print(f"总共找到 {x2_count} 颗 X2 卫星")
        
        if filtered_lines:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            print(f"数据已写入到 {output_file}")
            return True
        else:
            print("未找到任何 X2 卫星数据")
            return False
        
    except Exception as e:
        print(f"处理文件时出错：{str(e)}")
        return False

def filter_x2_satellites_streaming(response_text, output_file):
    """直接从响应文本流式过滤 X2 卫星，避免创建临时文件"""
    # 从环境变量获取目标卫星名称
    x2_satellites_env = os.getenv('X2_SATELLITES', 'x2-33686,x2-33675,x2-33655,x2-33608')
    target_satellites = set(name.strip() for name in x2_satellites_env.split(',') if name.strip())
    
    print(f"目标 X2 卫星: {target_satellites}")
    
    try:
        lines = response_text.strip().split('\n')
        filtered_lines = []
        i = 0
        x2_count = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 跳过空行
            if not line:
                i += 1
                continue
                
            # 检查是否为目标卫星名称行
            satellite_name = line.strip()
            if satellite_name in target_satellites:
                name_line = line
                tle1 = None
                tle2 = None
                
                # 查找 TLE 第一行
                j = i + 1
                while j < len(lines):
                    line1 = lines[j].strip()
                    if line1:  # 找到非空行
                        if line1.startswith('1 '):
                            tle1 = line1
                            break
                    j += 1
                
                # 查找 TLE 第二行
                k = j + 1
                while k < len(lines):
                    line2 = lines[k].strip()
                    if line2:  # 找到非空行
                        if line2.startswith('2 '):
                            tle2 = line2
                            break
                    k += 1
                
                # 验证是否找到完整的 TLE 数据
                if tle1 and tle2:
                    filtered_lines.extend([name_line + '\n', tle1 + '\n', tle2 + '\n'])
                    x2_count += 1
                    print(f"找到 X2 卫星: {name_line}")
                    i = k + 1  # 跳到下一组数据
                else:
                    print(f"警告: {name_line} 的 TLE 数据不完整")
                    i += 1
            else:
                i += 1
                
        print(f"总共找到 {x2_count} 颗 X2 卫星")
        
        if filtered_lines:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            print(f"数据已写入到 {output_file}")
            return True
        else:
            print("未找到任何 X2 卫星数据")
            return False
        
    except Exception as e:
        print(f"处理数据时出错：{str(e)}")
        return False

def filter_dtc_satellites_streaming(response_text, output_file):
    """直接从响应文本流式过滤 DTC 卫星，避免创建临时文件"""
    try:
        lines = response_text.strip().split('\n')
        filtered_lines = []
        i = 0
        dtc_count = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 跳过空行
            if not line:
                i += 1
                continue
                
            # 检查是否为卫星名称行且包含 [DTC] 标记
            if '[DTC]' in line:
                name_line = line
                tle1 = None
                tle2 = None
                
                # 查找 TLE 第一行
                j = i + 1
                while j < len(lines):
                    line1 = lines[j].strip()
                    if line1:  # 找到非空行
                        if line1.startswith('1 '):
                            tle1 = line1
                            break
                    j += 1
                
                # 查找 TLE 第二行
                k = j + 1
                while k < len(lines):
                    line2 = lines[k].strip()
                    if line2:  # 找到非空行
                        if line2.startswith('2 '):
                            tle2 = line2
                            break
                    k += 1
                
                # 验证是否找到完整的 TLE 数据
                if tle1 and tle2:
                    filtered_lines.extend([name_line + '\n', tle1 + '\n', tle2 + '\n'])
                    dtc_count += 1
                    print(f"找到 DTC 卫星: {name_line}")
                    i = k + 1  # 跳到下一组数据
                else:
                    print(f"警告: {name_line} 的 TLE 数据不完整")
                    i += 1
            else:
                i += 1
                
        print(f"总共找到 {dtc_count} 颗 DTC 卫星")
        
        if filtered_lines:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            print(f"数据已写入到 {output_file}")
            return True
        else:
            print("未找到任何 DTC 卫星数据")
            return False
        
    except Exception as e:
        print(f"处理数据时出错：{str(e)}")
        return False

# 删除以下三行测试代码：
# filter_dtc_satellites('starlink.tle', 'starlink_dtc.tle')
# filter_x2_satellites('starlink.tle', 'starlink_dtc.tle')
# filter_x2_satellites_streaming('starlink.tle', 'starlink_dtc.tle')
