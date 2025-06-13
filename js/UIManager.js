/**
 * UI管理模块
 * 负责用户界面的事件监听和交互处理
 */
class UIManager {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    // 初始化事件监听器
    initializeEventListeners() {
        // 星座选择变化
        document.getElementById('constellation').addEventListener('change', () => {
            this.tracker.ephemerisManager.autoDownloadOnConstellationChange();
        });
        

        
        // 开始跟踪按钮
        document.getElementById('controlBtn').addEventListener('click', () => {
            this.tracker.trackingController.startTracking();
        });
        
        // 停止跟踪按钮
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.tracker.trackingController.stopTracking();
        });
        
        // 强制时间模式切换
        document.getElementById('simulationMode').addEventListener('change', () => {
            this.toggleForceTimeMode();
        });
        
        // 地面站配置变化
        ['latitude', 'longitude', 'altitude'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.tracker.locationManager.saveGroundStationConfig();
            });
        });
        
        // 云台朝向变化
        document.getElementById('gimbalDirection').addEventListener('change', () => {
            this.tracker.locationManager.saveGroundStationConfig();
        });
        
        // 位置选择变化
        document.getElementById('locationSelect').addEventListener('change', (e) => {
            this.tracker.locationManager.selectLocation(e.target.value);
        });
        
        // 添加位置按钮
        document.getElementById('addLocationBtn').addEventListener('click', () => {
            this.tracker.locationManager.showAddLocationDialog();
        });
        
        // 清除所有位置按钮
        const clearLocationsBtn = document.getElementById('clearLocationsBtn');
        // 先移除可能存在的旧事件监听器
        const newClearBtn = clearLocationsBtn.cloneNode(true);
        clearLocationsBtn.parentNode.replaceChild(newClearBtn, clearLocationsBtn);
        
        document.getElementById('clearLocationsBtn').addEventListener('click', () => {
            this.tracker.locationManager.clearAllLocations();
        });
        
        // 监听表单提交事件（包括保存按钮点击）
        const addLocationForm = document.getElementById('addLocationForm');
        // 先移除可能存在的旧事件监听器
        const newForm = addLocationForm.cloneNode(true);
        addLocationForm.parentNode.replaceChild(newForm, addLocationForm);
        
        document.getElementById('addLocationForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.tracker.locationManager.saveNewLocation();
        });
        
        // 取消添加位置按钮
        const cancelLocationBtn = document.getElementById('cancelLocationBtn');
        // 先移除可能存在的旧事件监听器
        const newCancelBtn = cancelLocationBtn.cloneNode(true);
        cancelLocationBtn.parentNode.replaceChild(newCancelBtn, cancelLocationBtn);
        
        document.getElementById('cancelLocationBtn').addEventListener('click', () => {
            this.tracker.locationManager.hideAddLocationDialog();
        });
        
        // 设置默认日期时间
        this.setDefaultDateTime();
    }
    
    // 设置默认日期时间
    setDefaultDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        // 使用datetime-local格式
        const datetimeStr = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        const startTimeElement = document.getElementById('startTime');
        if (startTimeElement) {
            startTimeElement.value = datetimeStr;
        }
    }
    
    // 切换强制时间模式
    toggleForceTimeMode() {
        const forceTimeMode = document.getElementById('simulationMode').checked;
        const simulationTime = document.getElementById('simulationTime');
        
        simulationTime.style.display = forceTimeMode ? 'block' : 'none';
        const input = document.getElementById('startTime');
        input.disabled = !forceTimeMode;
        
        // 设置默认时间为当前时间
        if (forceTimeMode) {
            this.setDefaultDateTime();
        }
    }
    
    // 清除卫星列表
    clearSatelliteList() {
        const satelliteSelect = document.getElementById('satellite');
        satelliteSelect.innerHTML = '<option value="">请先下载星历数据</option>';
        this.tracker.addLog('已清除卫星列表');
    }
    
    // 更新云台朝向建议
    updateGimbalDirectionHint(direction, description) {
        const hintElement = document.getElementById('gimbalDirectionHint');
        if (hintElement) {
            hintElement.textContent = `建议云台朝向: ${direction} (${description})`;
            hintElement.style.display = 'block';
            hintElement.style.color = '#4CAF50';
            hintElement.style.fontWeight = 'bold';
        }
    }
    
    // 清除云台朝向建议
    clearGimbalDirectionHint() {
        const hintElement = document.getElementById('gimbalDirectionHint');
        if (hintElement) {
            hintElement.style.display = 'none';
        }
    }
}
