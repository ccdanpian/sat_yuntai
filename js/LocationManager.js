/**
 * 位置管理模块
 * 负责地面站位置的保存、加载和管理
 */
class LocationManager {
    constructor(tracker, statusManager = null) {
        this.tracker = tracker;
        this.statusManager = statusManager;
        // 初始化状态变量
        this.isSaving = false;
        this.isHiding = false;
        this.getCurrentLocationBound = false;
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
            
            // 只在第一次时绑定获取当前位置按钮事件
            if (!this.getCurrentLocationBound) {
                this.bindGetCurrentLocationButton();
                this.getCurrentLocationBound = true;
            }
        }
    }
    
    // 隐藏添加位置对话框
    hideAddLocationDialog() {
        const dialog = document.getElementById('addLocationDialog');
        if (dialog) {
            dialog.style.display = 'none';
            
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
        // 注意：HTML中没有gimbalDirection的对话框字段，使用默认值
        const gimbalDirection = 'auto';
        
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
                this.isSaving = false;
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
        
        this.tracker.addLog(`已保存位置: ${name}`);
        
        // 重置保存状态
        this.isSaving = false;
        
        // 隐藏对话框（放在最后，避免清空表单时触发事件）
        this.hideAddLocationDialog();
    }
    
    // 清除所有位置
    clearAllLocations() {
        if (confirm('确定要清除所有保存的位置吗？此操作不可撤销。')) {
            localStorage.removeItem('savedLocations');
            this.updateLocationSelect([]);
            this.tracker.addLog('已清除所有保存的位置');
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
