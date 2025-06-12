/**
 * 卫星跟踪器主类
 * 负责协调各个模块的工作
 */
class SatelliteTracker {
    constructor() {
        this.satellites = [];
        this.isTracking = false;
        this.lastTrajectoryPoints = null;
        this.forceTimeInterval = null;
        this.currentForceTime = null;
        this.forceTimeStartTime = null;
        this.trackingInterval = null;
        this.positionUpdateInterval = null;
        this.currentAzimuth = 0;
        this.currentElevation = 0;
        this.azimuthHistory = [];
        this.elevationHistory = [];
        this.groundStationConfig = null;
        this.savedLocations = {};
        
        // 检查是否开启debug模式
        const urlParams = new URLSearchParams(window.location.search);
        this.debugMode = urlParams.get('debug') === '1';
        
        // 星座URL配置
        this.constellationUrls = {
            'gps': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
            'glonass': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass-ops&FORMAT=tle',
            'galileo': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
            'beidou': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle',
            'starlink': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
            'starlink_dtc': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
            'oneweb': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle',
            'iridium': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle',
            'globalstar': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle',
            'x2': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
        };
        
        this.initializeModules();
    }
    
    initializeModules() {
        // 初始化各个模块
        this.ephemerisManager = new EphemerisManager(this);
        this.trackingController = new TrackingController(this);
        this.radarDisplay = new RadarDisplay(this);
        this.uiManager = new UIManager(this);
        this.locationManager = new LocationManager(this);
        this.statusManager = new StatusManager(this);
        
        // 初始化事件监听器
        this.uiManager.initializeEventListeners();
        
        // 加载配置
        this.locationManager.loadGroundStationConfig();
        this.locationManager.loadSavedLocations();
        
        // 初始化显示
        this.radarDisplay.drawRadarBackground();
        this.statusManager.initializeStatusDisplay();
        
        // 如果是debug模式，显示调试日志区域
        if (this.debugMode) {
            const debugLogSection = document.getElementById('debugLogSection');
            if (debugLogSection) {
                debugLogSection.style.display = 'block';
            }
        }
        
        // 自动下载x2星座星历数据
        this.ephemerisManager.autoDownloadX2Ephemeris();
    }
    
    // 日志记录方法
    addLog(message, type = 'info') {
        // 只有在debug模式下才输出到控制台和界面
        if (this.debugMode) {
            const timestamp = new Date().toLocaleTimeString();
            if (type === 'error') {
                console.error(`[${timestamp}] ${message}`);
            } else {
                console.log(`[${timestamp}] ${message}`);
            }
            
            const logContainer = document.getElementById('logContainer');
            if (!logContainer) return;
            
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${message}`;
            
            if (type === 'error') {
                logEntry.style.borderLeftColor = '#ff6b6b';
                logEntry.style.color = '#ffcccb';
            }
            
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
            
            // 限制日志条数
            while (logContainer.children.length > 100) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }
    }
    
    // 状态更新方法
    updateStatus(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
        
        if (this.debugMode) {
            console.log(`[STATUS] ${message}`);
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new SatelliteTracker();
});
