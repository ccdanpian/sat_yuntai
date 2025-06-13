/**
 * 状态管理模块
 * 负责应用状态的显示和更新
 */
class StatusManager {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    // 初始化状态显示
    initializeStatusDisplay() {
        // 初始化所有状态为隐藏
        this.hideSimulationStatus();
        this.updateStatus('等待操作...');
        
        // 检查云台状态
        this.checkGimbalStatus();
    }
    
    // 更新状态信息
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
        this.tracker.addLog(message);
    }
    
    // 更新状态显示
    updateStatusDisplay(elementIdOrStatus, text = null, type = null) {
        // 如果传入的是对象（旧的调用方式）
        if (typeof elementIdOrStatus === 'object' && text === null) {
            const status = elementIdOrStatus;
            const elements = {
                azimuth: document.getElementById('azimuthValue'),
                elevation: document.getElementById('elevationValue'),
                distance: document.getElementById('distanceValue'),
                velocity: document.getElementById('velocityValue'),
                nextPass: document.getElementById('nextPassValue')
            };
            
            Object.keys(status).forEach(key => {
                if (elements[key]) {
                    elements[key].textContent = status[key];
                }
            });
        } else {
            // 新的调用方式：updateStatusDisplay(elementId, text, type)
            const element = document.getElementById(elementIdOrStatus);
            if (element) {
                element.textContent = text;
                
                // 移除所有状态类
                element.classList.remove('error', 'warning', 'success');
                
                // 添加新的状态类
                if (type && type !== '') {
                    element.classList.add(type);
                }
            }
        }
    }
    
    // 显示云台初始化失败状态
    showGimbalFailureStatus() {
        const statusElement = document.getElementById('gimbalFailureStatus');
        if (statusElement) {
            statusElement.style.display = 'block';
        }
    }
    
    // 隐藏模拟运行状态
    hideSimulationStatus() {
        const statusElement = document.getElementById('simulationStatus');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }
    
    // 显示模拟运行状态
    showSimulationStatus() {
        const statusElement = document.getElementById('simulationStatus');
        if (statusElement) {
            statusElement.style.display = 'block';
        }
    }
    
    // 检查云台状态
    async checkGimbalStatus() {
        try {
            const response = await fetch('/api/gimbal_status');
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'error' || data.status === 'disconnected') {
                    this.showGimbalFailureStatus();
                    this.updateStatus('云台连接失败，将使用模拟模式');
                } else {
                    this.updateStatus('云台连接正常');
                }
            } else {
                this.showGimbalFailureStatus();
                this.updateStatus('无法获取云台状态，将使用模拟模式');
            }
        } catch (error) {
            this.showGimbalFailureStatus();
            this.updateStatus('云台状态检查失败: ' + error.message);
        }
    }
    
    // 更新跟踪状态
    updateTrackingStatus(isTracking) {
        const controlBtn = document.getElementById('controlBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (controlBtn && stopBtn) {
            controlBtn.disabled = isTracking;
            stopBtn.disabled = !isTracking;
        }
        
        if (isTracking) {
            this.updateStatus('正在跟踪卫星...');
        } else {
            this.updateStatus('跟踪已停止');
        }
    }
    
    // 更新下载进度
    updateDownloadProgress(progress) {
        const progressElement = document.getElementById('downloadProgress');
        if (progressElement) {
            progressElement.style.display = 'block';
            progressElement.textContent = `下载进度: ${progress}%`;
            
            if (progress >= 100) {
                setTimeout(() => {
                    progressElement.style.display = 'none';
                }, 2000);
            }
        }
    }
    
    // 显示错误信息
    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            errorElement.style.color = '#f44336';
            
            // 5秒后自动隐藏
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        }
        
        this.updateStatus('错误: ' + message);
    }
    
    // 显示成功信息
    showSuccess(message) {
        const successElement = document.getElementById('successMessage');
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
            successElement.style.color = '#4CAF50';
            
            // 3秒后自动隐藏
            setTimeout(() => {
                successElement.style.display = 'none';
            }, 3000);
        }
        
        this.updateStatus(message);
    }
    
    // 更新轨迹信息显示
    updateTrajectoryInfo(info) {
        const elements = {
            maxElevation: document.getElementById('maxElevationValue'),
            passTime: document.getElementById('passTimeValue'),
            actualStartTime: document.getElementById('actualStartTimeValue')
        };
        
        if (info.maxElevation !== undefined && elements.maxElevation) {
            elements.maxElevation.textContent = `${info.maxElevation.toFixed(1)}°`;
        }
        
        if (info.passTime !== undefined && elements.passTime) {
            elements.passTime.textContent = `${info.passTime.toFixed(1)}分钟`;
        }
        
        if (info.actualStartTime && elements.actualStartTime) {
            elements.actualStartTime.textContent = info.actualStartTime;
        }
    }
}
