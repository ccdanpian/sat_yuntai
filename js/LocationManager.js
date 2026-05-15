/**
 * 位置管理模块
 * 负责地面站位置的保存、加载和管理
 */
class LocationManager {
    constructor(tracker, statusManager = null) {
        this.tracker = tracker;
        this.statusManager = statusManager;
        this.defaultLocationName = '雄安';
        this.defaultLocations = [
            { name: '北京', latitude: 39.9042, longitude: 116.4074, altitude: 0 },
            { name: '涞水', latitude: 39.5373, longitude: 115.7055, altitude: 0 },
            { name: '雄安', latitude: 39.0742, longitude: 116.0185, altitude: 0 },
            { name: '库尔勒', latitude: 41.7259, longitude: 86.1746, altitude: 880 },
            { name: '文昌', latitude: 19.62, longitude: 110.75, altitude: 40 },
            { name: '澄迈', latitude: 19.9244, longitude: 110.1284, altitude: 70 },
            { name: '石家庄', latitude: 38.056124, longitude: 114.361285, altitude: 0 },
            { name: '上海', latitude: 31.2286, longitude: 121.4747, altitude: 5 },
            { name: '成都', latitude: 30.66, longitude: 104.0633, altitude: 500 }
        ];
        // 初始化状态变量
        this.isSaving = false;
        this.isHiding = false;
        this.getCurrentLocationBound = false;
    }
    
    // 加载地面站配置
    loadGroundStationConfig() {
        // 加载位置配置
        const savedLocationConfig = localStorage.getItem('groundStationConfig');
        if (savedLocationConfig) {
            try {
                const locationConfig = JSON.parse(savedLocationConfig);
                document.getElementById('latitude').value = locationConfig.latitude || '';
                document.getElementById('longitude').value = locationConfig.longitude || '';
                document.getElementById('altitude').value = locationConfig.altitude || '';
                this.tracker.addLog('已加载地面站位置配置');
            } catch (e) {
                this.tracker.addLog('加载地面站位置配置失败: ' + e.message);
            }
        } else {
            const defaultLocation = this.getLocationByName(this.defaultLocationName);
            if (defaultLocation) {
                this.applyLocation(defaultLocation, false);
                this.tracker.addLog(`已加载默认地面站位置: ${defaultLocation.name}`);
            }
        }
        
        // 加载云台配置
        const savedGimbalConfig = localStorage.getItem('gimbalConfig');
        if (savedGimbalConfig) {
            try {
                const gimbalConfig = JSON.parse(savedGimbalConfig);
                document.getElementById('gimbalDirection').value = gimbalConfig.gimbalDirection || 'north';
                this.tracker.addLog('已加载云台配置');
            } catch (e) {
                this.tracker.addLog('加载云台配置失败: ' + e.message);
            }
        }
    }
    
    // 保存地面站配置
    saveGroundStationConfig() {
        const locationConfig = {
            latitude: document.getElementById('latitude').value,
            longitude: document.getElementById('longitude').value,
            altitude: document.getElementById('altitude').value
        };
        
        const gimbalConfig = {
            gimbalDirection: document.getElementById('gimbalDirection').value
        };
        
        localStorage.setItem('groundStationConfig', JSON.stringify(locationConfig));
        localStorage.setItem('gimbalConfig', JSON.stringify(gimbalConfig));
        this.tracker.addLog('已保存地面站配置');
    }
    
    // 加载保存的位置
    loadSavedLocations() {
        const locations = this.getAllLocations();
        this.updateLocationSelect(locations);
        this.tracker.addLog(`已加载 ${locations.length} 个位置`);
    }
    
    // 更新位置选择下拉菜单
    updateLocationSelect(locations) {
        const locationSelect = document.getElementById('locationSelect');
        locationSelect.innerHTML = '<option value="">选择预设位置</option>';
        
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = `${location.name} (${location.latitude}, ${location.longitude})`;
            locationSelect.appendChild(option);
        });

        const matchedLocationName = this.getMatchingLocationName(locations);
        if (matchedLocationName) {
            locationSelect.value = matchedLocationName;
        }
    }
    
    // 选择位置
    selectLocation(locationName) {
        if (!locationName) return;
        
        const location = this.getLocationByName(locationName);
        if (location) {
            this.applyLocation(location);
            this.tracker.addLog(`已选择位置: ${location.name}`);
        }
    }

    normalizeLocations(locations) {
        const source = Array.isArray(locations) ? locations : [];
        const normalized = [];

        for (const location of source) {
            if (!location || typeof location.name !== 'string') continue;

            const name = location.name.trim();
            const latitude = Number(location.latitude);
            const longitude = Number(location.longitude);
            const altitude = Number(location.altitude || 0);

            if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(altitude)) {
                continue;
            }

            const existingIndex = normalized.findIndex(item => item.name === name);
            const normalizedLocation = { name, latitude, longitude, altitude };
            if (existingIndex >= 0) {
                normalized[existingIndex] = normalizedLocation;
            } else {
                normalized.push(normalizedLocation);
            }
        }

        return normalized;
    }

    getCustomLocations() {
        const savedLocations = localStorage.getItem('savedLocations');
        if (!savedLocations) return [];

        try {
            return this.normalizeLocations(JSON.parse(savedLocations));
        } catch (e) {
            this.tracker.addLog('加载保存位置失败: ' + e.message);
            return [];
        }
    }

    getAllLocations() {
        const mergedByName = new Map();
        const customOnlyNames = [];

        for (const location of this.normalizeLocations(this.defaultLocations)) {
            mergedByName.set(location.name, location);
        }

        for (const location of this.getCustomLocations()) {
            if (!mergedByName.has(location.name)) {
                customOnlyNames.push(location.name);
            }
            mergedByName.set(location.name, location);
        }

        const orderedLocations = [];
        for (const location of this.defaultLocations) {
            const merged = mergedByName.get(location.name);
            if (merged) orderedLocations.push(merged);
        }
        for (const name of customOnlyNames) {
            orderedLocations.push(mergedByName.get(name));
        }

        return orderedLocations;
    }

    getLocationByName(name) {
        return this.getAllLocations().find(location => location.name === name) || null;
    }

    getMatchingLocationName(locations = this.getAllLocations()) {
        const latitude = Number(document.getElementById('latitude').value);
        const longitude = Number(document.getElementById('longitude').value);
        const altitude = Number(document.getElementById('altitude').value || 0);

        const matched = locations.find(location =>
            location.latitude === latitude &&
            location.longitude === longitude &&
            location.altitude === altitude
        );

        return matched ? matched.name : '';
    }

    applyLocation(location, saveConfig = true) {
        document.getElementById('latitude').value = location.latitude;
        document.getElementById('longitude').value = location.longitude;
        document.getElementById('altitude').value = location.altitude || 0;

        const locationSelect = document.getElementById('locationSelect');
        if (locationSelect) {
            locationSelect.value = location.name;
        }

        if (saveConfig) {
            this.saveGroundStationConfig();
        }
    }
    
    // 显示添加位置对话框
    showAddLocationDialog() {
        const dialog = document.getElementById('addLocationDialog');
        if (dialog) {
            // 预填充当前坐标
            const currentLat = document.getElementById('latitude').value;
            const currentLon = document.getElementById('longitude').value;
            const currentAlt = document.getElementById('altitude').value;
            const currentDir = document.getElementById('gimbalDirection').value;
            
            document.getElementById('dialogLatitude').value = currentLat;
            document.getElementById('dialogLongitude').value = currentLon;
            document.getElementById('dialogAltitude').value = currentAlt;
            // 注意：HTML中没有gimbalDirection的对话框字段，跳过设置
            
            // 只在第一次时绑定获取当前位置按钮事件
            if (!this.getCurrentLocationBound) {
                this.bindGetCurrentLocationButton();
                this.getCurrentLocationBound = true;
            }
            
            // 使用showModal()方法显示模态对话框
            dialog.showModal();
        }
    }
    
    // 隐藏添加位置对话框
    hideAddLocationDialog() {
        const dialog = document.getElementById('addLocationDialog');
        if (dialog) {
            // 使用close()方法关闭模态对话框
            dialog.close();
            
            // 清空表单，但要避免在保存过程中清空
            if (!this.isHiding && !this.isSaving) {
                this.isHiding = true;
                // 使用setTimeout确保在事件处理完成后再清空表单
                setTimeout(() => {
                    document.getElementById('locationName').value = '';
                    document.getElementById('dialogLatitude').value = '';
                    document.getElementById('dialogLongitude').value = '';
                    document.getElementById('dialogAltitude').value = '';
                    this.isHiding = false;
                }, 0);
            }
        }
    }
    
    // 保存新位置
    saveNewLocation() {
        // 防止重复调用
        if (this.isSaving) {
            return;
        }
        this.isSaving = true;
        
        const name = document.getElementById('locationName').value.trim();
        const latitude = document.getElementById('dialogLatitude').value.trim();
        const longitude = document.getElementById('dialogLongitude').value.trim();
        const altitude = document.getElementById('dialogAltitude').value.trim();
        
        // 更严格的验证
        if (name.length === 0) {
            alert('请填写位置名称');
            this.isSaving = false;
            return;
        }
        
        if (latitude.length === 0) {
            alert('请填写纬度');
            this.isSaving = false;
            return;
        }
        
        if (longitude.length === 0) {
            alert('请填写经度');
            this.isSaving = false;
            return;
        }
        
        // 验证坐标格式
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            alert('请输入有效的坐标（纬度: -90到90，经度: -180到180）');
            this.isSaving = false;
            return;
        }
        
        // 获取现有位置
        let locations = this.getCustomLocations();
        const allLocations = this.getAllLocations();
        
        // 检查是否已存在同名位置
        if (allLocations.some(loc => loc.name === name)) {
            if (!confirm(`位置 "${name}" 已存在，是否覆盖？`)) {
                this.isSaving = false;
                return;
            }
            // 移除旧的同名位置
            locations = locations.filter(loc => loc.name !== name);
        }
        
        // 添加新位置（只保存位置信息，不包含云台朝向）
        const newLocation = {
            name: name,
            latitude: latitude,
            longitude: longitude,
            altitude: altitude
        };
        
        locations.push(newLocation);
        
        // 保存到localStorage
        localStorage.setItem('savedLocations', JSON.stringify(this.normalizeLocations(locations)));
        
        // 更新下拉菜单
        this.updateLocationSelect(this.getAllLocations());
        
        this.tracker.addLog(`已保存位置: ${name}`);
        
        // 重置保存状态
        this.isSaving = false;
        
        // 隐藏对话框（放在最后，避免清空表单时触发事件）
        this.hideAddLocationDialog();
    }
    
    // 清除所有位置
    clearAllLocations() {
        if (confirm('确定要清除自定义位置并恢复内置位置吗？')) {
            localStorage.removeItem('savedLocations');
            this.updateLocationSelect(this.getAllLocations());
            this.tracker.addLog('已清除自定义位置，恢复内置位置');
        }
    }
    
    // 绑定获取当前位置按钮事件
    bindGetCurrentLocationButton() {
        const getCurrentLocationBtn = document.getElementById('getCurrentLocationBtn');
        if (getCurrentLocationBtn) {
            // 移除之前的事件监听器（如果有的话）
            getCurrentLocationBtn.replaceWith(getCurrentLocationBtn.cloneNode(true));
            const newBtn = document.getElementById('getCurrentLocationBtn');
            
            newBtn.addEventListener('click', () => {
                this.getCurrentLocation();
            });
        }
    }
    
    // 获取当前位置
    getCurrentLocation() {
        const btn = document.getElementById('getCurrentLocationBtn');
        
        if (!navigator.geolocation) {
            const message = '您的浏览器不支持地理位置功能';
            if (this.statusManager) {
                this.statusManager.showStatus(message, 'error');
            } else {
                alert(message);
            }
            return;
        }
        
        // 更新按钮状态
        btn.disabled = true;
        btn.textContent = '🔄 获取中...';
        
        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(6);
                const lon = position.coords.longitude.toFixed(6);
                const alt = position.coords.altitude ? Math.round(position.coords.altitude) : 0;
                
                // 填充输入框
                document.getElementById('dialogLatitude').value = lat;
                document.getElementById('dialogLongitude').value = lon;
                document.getElementById('dialogAltitude').value = alt;
                
                // 恢复按钮状态
                btn.disabled = false;
                btn.textContent = '📍 获取当前位置';
                
                const message = `已获取当前位置: ${lat}, ${lon}`;
                if (this.statusManager) {
                    this.statusManager.showStatus(message, 'success');
                } else {
                    this.tracker.addLog(message);
                }
            },
            (error) => {
                // 恢复按钮状态
                btn.disabled = false;
                btn.textContent = '📍 获取当前位置';
                
                let message = '获取位置失败: ';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        message += '用户拒绝了位置请求';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message += '位置信息不可用';
                        break;
                    case error.TIMEOUT:
                        message += '请求超时';
                        break;
                    default:
                        message += '未知错误';
                        break;
                }
                
                if (this.statusManager) {
                    this.statusManager.showStatus(message, 'error');
                } else {
                    alert(message);
                }
            },
            options
        );
    }
}
