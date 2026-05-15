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
        this.positionDisplayIntervalMs = 100;
        this.currentAzimuth = 0;
        this.currentElevation = 0;
        this.azimuthHistory = [];
        this.elevationHistory = [];
        this.groundStationConfig = null;
        this.savedLocations = {};
        
        // 检查是否开启debug模式
        const urlParams = new URLSearchParams(window.location.search);
        this.debugMode = urlParams.get('debug') === '1';
        this.apiToken = localStorage.getItem('satYuntaiApiToken') || '';
        const apiTokenFromUrl = urlParams.get('apiToken');
        if (apiTokenFromUrl) {
            this.apiToken = apiTokenFromUrl;
            localStorage.setItem('satYuntaiApiToken', apiTokenFromUrl);
        }
        this.apiTokenPrompted = false;
        
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
            'x2': 'https://celestrak.org/NORAD/elements/gp.php?INTDES=2025-067&FORMAT=tle',
            'x2-3': 'https://celestrak.org/NORAD/elements/gp.php?INTDES=2026-091&FORMAT=tle'
        };
        this.constellationLabels = {
            'gps': 'GPS',
            'glonass': 'GLONASS',
            'galileo': 'Galileo',
            'beidou': '北斗',
            'starlink': '星链',
            'starlink_dtc': '星链DTC',
            'oneweb': 'OneWeb',
            'iridium': '铱星',
            'globalstar': '全球星',
            'x2': 'X2星座',
            'x2-3': 'X2-3星座'
        };

        // X2 系列使用国际代号精确筛选，并按 sat 项目的规则处理显示名称
        this.specialSatelliteConfig = {
            'x2': {
                targetIntdes: ['2025-067A', '2025-067B', '2025-067C', '2025-067D'],
                targetNames: ['HJS-6A', 'HJS-6B', 'HJS-6C', 'HJS-6D'],
                aliases: {
                    '2025-067B': '04-YH',
                    '2025-067C': '01-YH',
                    '2025-067D': '02-CG'
                },
                preferIntdesName: false
            },
            'x2-3': {
                targetIntdes: ['2026-091A', '2026-091B', '2026-091C', '2026-091D'],
                targetNames: ['2026-091A', '2026-091B', '2026-091C', '2026-091D'],
                aliases: {
                    '2026-091A': '11-YH',
                    '2026-091B': '18-GD',
                    '2026-091C': '09-CG',
                    '2026-091D': '10-BY'
                },
                preferIntdesName: true
            }
        };
        
        this.initializeModules();
    }
    
    initializeModules() {
        // 初始化各个模块
        this.ephemerisManager = new EphemerisManager(this);
        this.trackingController = new TrackingController(this);
        this.radarDisplay = new RadarDisplay(this);
        this.gimbal3DView = typeof Gimbal3DView !== 'undefined' ? new Gimbal3DView(this) : null;
        this.uiManager = new UIManager(this);
        this.statusManager = new StatusManager(this);
        this.locationManager = new LocationManager(this, this.statusManager);
        this.elevationDataManager = new ElevationDataManager(this);
        
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
        
        // 同步后端支持的星座后自动下载x2星座星历数据
        this.ephemerisManager.loadConstellationOptions()
            .finally(() => this.ephemerisManager.autoDownloadX2Ephemeris());
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
            
            const logContainer = document.getElementById('debugLog') || document.getElementById('logContainer');
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
        const statusText = document.getElementById('statusText') || document.getElementById('status');
        if (statusText) {
            statusText.textContent = message;
        }
        
        if (this.debugMode) {
            console.log(`[STATUS] ${message}`);
        }
    }

    async apiFetch(url, options = {}) {
        const requestOptions = { ...options };
        const headers = new Headers(requestOptions.headers || {});

        if (this.apiToken) {
            headers.set('X-API-Token', this.apiToken);
        }

        requestOptions.headers = headers;
        let response = await fetch(url, requestOptions);

        if (response.status === 401 && !this.apiTokenPrompted) {
            this.apiTokenPrompted = true;
            const token = window.prompt('请输入云台控制令牌');
            if (token) {
                this.apiToken = token.trim();
                localStorage.setItem('satYuntaiApiToken', this.apiToken);
                headers.set('X-API-Token', this.apiToken);
                response = await fetch(url, requestOptions);
            }
            this.apiTokenPrompted = false;
        }

        return response;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new SatelliteTracker();
});
