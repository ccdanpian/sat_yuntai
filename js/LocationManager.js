/**
 * 位置管理模块
 * 负责地面站位置的保存、加载和管理
 */
class LocationManager {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    // 加载地面站配置
    loadGroundStationConfig() {
        const savedConfig = localStorage.getItem('groundStationConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                document.getElementById('latitude').value = config.latitude || '';
                document.getElementById('longitude').value = config.longitude || '';
                document.getElementById('altitude').value = config.altitude || '';
                document.getElementById('gimbalDirection').value = config.gimbalDirection || 'auto';
                this.tracker.addLog('已加载地面站配置');
            } catch (e) {
                this.tracker.addLog('加载地面站配置失败: ' + e.message);
            }
        }
    }
    
    // 保存地面站配置
    saveGroundStationConfig() {
        const config = {
            latitude: document.getElementById('latitude').value,
            longitude: document.getElementById('longitude').value,
            altitude: document.getElementById('altitude').value,
            gimbalDirection: document.getElementById('gimbalDirection').value
        };
        
        localStorage.setItem('groundStationConfig', JSON.stringify(config));
        this.tracker.addLog('已保存地面站配置');
    }
    
    // 加载保存的位置
    loadSavedLocations() {
        const savedLocations = localStorage.getItem('savedLocations');
        if (savedLocations) {
            try {
                const locations = JSON.parse(savedLocations);
                this.updateLocationSelect(locations);
                this.tracker.addLog(`已加载 ${locations.length} 个保存的位置`);
            } catch (e) {
                this.tracker.addLog('加载保存位置失败: ' + e.message);
            }
        }
    }
    
    // 更新位置选择下拉菜单
    updateLocationSelect(locations) {
        const locationSelect = document.getElementById('locationSelect');
        locationSelect.innerHTML = '<option value="">选择保存的位置</option>';
        
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = `${location.name} (${location.latitude}, ${location.longitude})`;
            locationSelect.appendChild(option);
        });
    }
    
    // 选择位置
    selectLocation(locationName) {
        if (!locationName) return;
        
        const savedLocations = localStorage.getItem('savedLocations');
        if (savedLocations) {
            try {
                const locations = JSON.parse(savedLocations);
                const location = locations.find(loc => loc.name === locationName);
                if (location) {
                    document.getElementById('latitude').value = location.latitude;
                    document.getElementById('longitude').value = location.longitude;
                    document.getElementById('altitude').value = location.altitude || '';
                    document.getElementById('gimbalDirection').value = location.gimbalDirection || 'auto';
                    this.saveGroundStationConfig();
                    this.tracker.addLog(`已选择位置: ${location.name}`);
                }
            } catch (e) {
                this.tracker.addLog('选择位置失败: ' + e.message);
            }
        }
    }
    
    // 显示添加位置对话框
    showAddLocationDialog() {
        const dialog = document.getElementById('addLocationDialog');
        if (dialog) {
            dialog.style.display = 'block';
            
            // 预填充当前坐标
            const currentLat = document.getElementById('latitude').value;
            const currentLon = document.getElementById('longitude').value;
            const currentAlt = document.getElementById('altitude').value;
            const currentDir = document.getElementById('gimbalDirection').value;
            
            document.getElementById('dialogLatitude').value = currentLat;
            document.getElementById('dialogLongitude').value = currentLon;
            document.getElementById('dialogAltitude').value = currentAlt;
            // 注意：HTML中没有gimbalDirection的对话框字段，跳过设置
        }
    }
    
    // 隐藏添加位置对话框
    hideAddLocationDialog() {
        const dialog = document.getElementById('addLocationDialog');
        if (dialog) {
            dialog.style.display = 'none';
            // 清空输入框
            document.getElementById('locationName').value = '';
            document.getElementById('dialogLatitude').value = '';
            document.getElementById('dialogLongitude').value = '';
            document.getElementById('dialogAltitude').value = '';
        }
    }
    
    // 保存新位置
    saveNewLocation() {
        const name = document.getElementById('locationName').value.trim();
        const latitude = document.getElementById('dialogLatitude').value;
        const longitude = document.getElementById('dialogLongitude').value;
        const altitude = document.getElementById('dialogAltitude').value;
        // 注意：HTML中没有gimbalDirection的对话框字段，使用默认值
        const gimbalDirection = 'auto';
        
        if (!name || !latitude || !longitude) {
            alert('请填写位置名称、纬度和经度');
            return;
        }
        
        // 验证坐标格式
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            alert('请输入有效的坐标（纬度: -90到90，经度: -180到180）');
            return;
        }
        
        // 获取现有位置
        let locations = [];
        const savedLocations = localStorage.getItem('savedLocations');
        if (savedLocations) {
            try {
                locations = JSON.parse(savedLocations);
            } catch (e) {
                this.tracker.addLog('解析保存位置失败: ' + e.message);
            }
        }
        
        // 检查是否已存在同名位置
        if (locations.some(loc => loc.name === name)) {
            if (!confirm(`位置 "${name}" 已存在，是否覆盖？`)) {
                return;
            }
            // 移除旧的同名位置
            locations = locations.filter(loc => loc.name !== name);
        }
        
        // 添加新位置
        const newLocation = {
            name: name,
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            gimbalDirection: gimbalDirection
        };
        
        locations.push(newLocation);
        
        // 保存到localStorage
        localStorage.setItem('savedLocations', JSON.stringify(locations));
        
        // 更新下拉菜单
        this.updateLocationSelect(locations);
        
        // 隐藏对话框
        this.hideAddLocationDialog();
        
        this.tracker.addLog(`已保存位置: ${name}`);
    }
    
    // 清除所有位置
    clearAllLocations() {
        if (confirm('确定要清除所有保存的位置吗？此操作不可撤销。')) {
            localStorage.removeItem('savedLocations');
            this.updateLocationSelect([]);
            this.tracker.addLog('已清除所有保存的位置');
        }
    }
}
