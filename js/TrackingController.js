/**
 * 跟踪控制模块
 * 负责卫星跟踪的启动、停止和实时控制
 */
class TrackingController {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    async startTracking() {
        const satelliteIndex = document.getElementById('satellite').value;
        if (!satelliteIndex) {
            this.tracker.addLog('请先选择卫星', 'error');
            return;
        }
        
        // 如果当前正在跟踪，先停止当前任务
        if (this.tracker.isTracking) {
            this.tracker.addLog('检测到正在进行的跟踪任务，正在停止...', 'warning');
            try {
                await this.stopTracking();
                this.tracker.addLog('已停止当前跟踪任务', 'info');
                // 等待一小段时间确保停止完成
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                this.tracker.addLog(`停止当前任务失败: ${error.message}`, 'error');
                return;
            }
        }
        
        const satellite = this.tracker.satellites[satelliteIndex];
        const latitude = parseFloat(document.getElementById('latitude').value);
        const longitude = parseFloat(document.getElementById('longitude').value);
        const altitude = parseFloat(document.getElementById('altitude').value);
        const forceTimeMode = document.getElementById('simulationMode').checked;
        const startTime = document.getElementById('startTime').value;
        const gimbalDirection = document.getElementById('gimbalDirection').value;
        const forceStartTime = forceTimeMode ? new Date(startTime) : null;
        
        if (isNaN(latitude) || isNaN(longitude) || isNaN(altitude)) {
            this.tracker.addLog('请填写正确的地面站坐标', 'error');
            return;
        }

        if (forceTimeMode && !startTime) {
            this.tracker.addLog('强制时间模式下请填写开始时间', 'error');
            return;
        }

        if (forceTimeMode && Number.isNaN(forceStartTime.getTime())) {
            this.tracker.addLog('强制时间格式无效', 'error');
            return;
        }
        
        // 只发送选中卫星的星历数据给后端
        const trackingData = {
            satellite: {
                name: satellite.name,
                line1: satellite.line1,
                line2: satellite.line2,
                noradId: satellite.noradId
            },
            groundStation: {
                latitude: latitude,
                longitude: longitude,
                altitude: altitude
            },
            simulationMode: forceTimeMode,
            startTime: forceTimeMode ? forceStartTime.toISOString() : null,
            gimbalDirection: gimbalDirection
        };
        
        try {
            document.getElementById('controlBtn').disabled = true;
            document.getElementById('stopBtn').disabled = true;

            // 先计算轨迹，确认有可用过境后再启动真实云台控制
            this.tracker.statusManager.updateStatusDisplay('trajectoryStatus', '🔍 搜索轨迹', 'warning');
            const trajectoryData = await this.calculateAndDrawFullTrajectory(trackingData);
            const hasUsableTrajectory = this.tracker.lastTrajectoryPoints &&
                this.tracker.lastTrajectoryPoints.some(point => point.visible);

            if (!trajectoryData || !hasUsableTrajectory) {
                throw new Error('未找到可用可见轨迹，未启动云台');
            }

            trackingData.trajectoryPoints = this.tracker.lastTrajectoryPoints;
            this.tracker.statusManager.updateStatusDisplay('trajectoryStatus', '✅ 轨迹计算完成', 'success');
            this.tracker.statusManager.updateStatusDisplay('calculationStatus', '🧮 计算云台朝向建议', 'warning');

            const response = await this.tracker.apiFetch('/api/start_tracking', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(trackingData)
            });
            
            if (!response.ok) {
                throw new Error(`启动跟踪失败: ${response.statusText}`);
            }
            
            this.tracker.isTracking = true;
            this.tracker.forceTimeStartTime = forceTimeMode ? new Date(trackingData.startTime) : new Date();
            
            document.getElementById('controlBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            
            this.tracker.updateStatus(`正在跟踪卫星: ${satellite.name}`);
            this.tracker.statusManager.updateStatusDisplay('trackingStatus', '🎯 跟踪正常', 'success');
            this.tracker.addLog(`开始跟踪卫星: ${satellite.name} (${satellite.noradId})`);

            // 开始前端指向显示
            this.startFrontendDisplay(trackingData);
            
            // 云台朝向计算完成
            this.tracker.statusManager.updateStatusDisplay('calculationStatus', '✅ 云台朝向计算完成', 'success');
            
            // 开始收集仰角数据
            if (this.tracker.elevationDataManager) {
                this.tracker.elevationDataManager.startCollecting();
            }
            
        } catch (error) {
            this.tracker.isTracking = false;
            document.getElementById('controlBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            this.tracker.statusManager.updateStatusDisplay('trackingStatus', '⏹️ 未启动跟踪', 'warning');
            const hasUsableTrajectory = this.tracker.lastTrajectoryPoints &&
                this.tracker.lastTrajectoryPoints.some(point => point.visible);
            if (!hasUsableTrajectory) {
                this.tracker.statusManager.updateStatusDisplay('trajectoryStatus', '❌ 轨迹不可用', 'error');
            }
            this.tracker.addLog(`启动跟踪失败: ${error.message}`, 'error');
        }
    }
    
    async stopTracking() {
        try {
            this.tracker.addLog('正在停止跟踪并复位云台...', 'info');
            this.tracker.statusManager.updateStatusDisplay('trackingStatus', '⏹️ 正在停止跟踪', 'warning');
            
            const response = await this.tracker.apiFetch('/api/stop_tracking', {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`停止跟踪失败: ${response.statusText}`);
            }
            
            this.tracker.isTracking = false;
            
            if (this.tracker.trackingInterval) {
                clearInterval(this.tracker.trackingInterval);
                this.tracker.trackingInterval = null;
            }
            
            // 清除云台朝向建议
            this.clearGimbalDirectionHint();
            
            document.getElementById('controlBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            
            // 等待云台复位完成
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.tracker.updateStatus('跟踪已停止，云台已复位');
            this.tracker.statusManager.updateStatusDisplay('trackingStatus', '⏹️ 跟踪已停止', 'warning');
            this.tracker.statusManager.updateStatusDisplay('trajectoryStatus', '⏳ 等待搜索轨迹', '');
            this.tracker.statusManager.updateStatusDisplay('calculationStatus', '⏳ 等待计算云台朝向', '');
            this.tracker.addLog('跟踪已停止，云台已复位到零位');
            
            // 停止收集仰角数据并更新按钮状态
            if (this.tracker.elevationDataManager) {
                this.tracker.elevationDataManager.stopCollecting();
                this.tracker.elevationDataManager.updateDownloadButtonState();
            }
            
        } catch (error) {
            this.tracker.addLog(`停止跟踪失败: ${error.message}`, 'error');
            this.tracker.statusManager.updateStatusDisplay('trackingStatus', '❌ 停止跟踪失败', 'error');
        }
    }
    
    // 预先计算并绘制完整的过境轨迹
    async calculateAndDrawFullTrajectory(trackingData) {
        try {
            // 开始新追踪时清除旧轨迹
            this.tracker.lastTrajectoryPoints = null;
            this.tracker.radarDisplay.drawRadarBackground();
            
            this.tracker.addLog('正在计算完整过境轨迹...');
            
            const satellite = trackingData.satellite;
            const groundStation = trackingData.groundStation;
            // 确定起始时间（确保时间处理的一致性）
            let startTime;
            if (trackingData.simulationMode && trackingData.startTime) {
                // 强制时间模式：使用用户选定的起始时间（北京时间）
                startTime = new Date(trackingData.startTime);
                this.tracker.addLog(`使用指定起始时间（北京时间）: ${startTime.toLocaleString()}`);
            } else {
                // 实时模式：使用当前时间（北京时间）
                startTime = new Date();
                this.tracker.addLog(`使用当前时间（北京时间）: ${startTime.toLocaleString()}`);
            }
            
            // 检查是否有TLE数据
            if (!satellite || !satellite.line1 || !satellite.line2) {
                this.tracker.addLog('缺少卫星TLE数据，无法计算轨迹', 'error');
                return;
            }
            
            // 在请求新的轨迹数据前，清除旧的显示信息
            const maxElevationDisplayClear = document.getElementById('maxElevationDisplay');
            if (maxElevationDisplayClear) maxElevationDisplayClear.textContent = '';
            const actualStartTimeDisplayClear = document.getElementById('actualStartTimeDisplay');
            if (actualStartTimeDisplayClear) actualStartTimeDisplayClear.textContent = '';

            // 调用后端API计算轨迹
            const trajectoryData = await this.requestTrajectoryFromBackend(satellite, groundStation, startTime);
            if (!trajectoryData) {
                this.tracker.addLog('后端轨迹计算失败', 'error');
                return null;
            }
            
            const trajectoryPoints = trajectoryData.trajectoryPoints || [];
            
            if (trajectoryPoints.length > 0) {
                // 筛选第一次完整过境（从仰角>0到仰角<=0）
                const filteredPoints = [];
                let foundFirstRise = false;
                let foundFirstSet = false;
                
                for (const point of trajectoryPoints) {
                    if (!foundFirstRise && point.elevation > 0) {
                        foundFirstRise = true;
                        filteredPoints.push(point);
                    } else if (foundFirstRise && !foundFirstSet) {
                        filteredPoints.push(point);
                        if (point.elevation <= 0) {
                            foundFirstSet = true;
                        }
                    } else if (foundFirstRise && foundFirstSet && point.elevation > 0) {
                        break;
                    }
                }
                
                // 保存轨迹数据
                this.tracker.lastTrajectoryPoints = filteredPoints;
                
                // 绘制完整轨迹
                this.tracker.radarDisplay.drawTrajectoryOnRadar(filteredPoints);
                
                const visiblePoints = filteredPoints.filter(p => p.visible);
                this.tracker.addLog(`轨迹计算完成: 总计${filteredPoints.length}个点，可见点${visiblePoints.length}个`);
                
                // 更新下载按钮状态
                if (this.tracker.elevationDataManager) {
                    this.tracker.elevationDataManager.updateDownloadButtonState();
                }
                
                // 分析轨迹并提供朝向建议
                if (visiblePoints.length > 0) {
                    const analysis = this.analyzeTrajectoryDirection(visiblePoints);
                    const maxElevationPoint = analysis.maxElevationPoint;
                    
                    this.tracker.addLog(`最高仰角: ${maxElevationPoint.elevation.toFixed(1)}° (方位角: ${maxElevationPoint.azimuth.toFixed(1)}°)`);
                    this.tracker.addLog(`过境分析: ${analysis.passDirection} - 建议云台朝向: ${analysis.gimbalDirection}`);
                    
                    // 显示云台朝向建议
                    this.updateGimbalDirectionHint(analysis.gimbalDirection, analysis.passDirection);
                    
                    // 计算过境时间信息
                    const startTime = new Date(visiblePoints[0].time);
                    const endTime = new Date(visiblePoints[visiblePoints.length - 1].time);
                    const duration = Math.round((endTime - startTime) / 1000 / 60); // 分钟
                    
                    this.tracker.addLog(`过境时间: ${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()} (约${duration}分钟)`);

                    // 显示从后端获取的最大仰角和实际起始时间（如果存在）
                    if (trajectoryData.maxElevation !== undefined) {
                        this.tracker.addLog(`后端报告最大仰角: ${trajectoryData.maxElevation}°`);
                        const maxElevationDisplay = document.getElementById('maxElevationDisplay');
                        if (maxElevationDisplay) {
                            maxElevationDisplay.textContent = `最大仰角: ${trajectoryData.maxElevation}°`;
                        }
                    }
                    if (trajectoryData.actualStartTime) {
                        const actualStart = new Date(trajectoryData.actualStartTime);
                        this.tracker.addLog(`后端报告轨迹实际起始时间: ${actualStart.toLocaleString()}`);
                        const actualStartTimeDisplay = document.getElementById('actualStartTimeDisplay');
                        if (actualStartTimeDisplay) {
                            actualStartTimeDisplay.textContent = `轨迹起始: ${actualStart.toLocaleString()}`;
                        }
                    }

                } else {
                    this.tracker.addLog('当前时段内卫星不可见');
                    this.clearGimbalDirectionHint();
                    // 清除可能存在的旧的UI显示
                    const maxElevationDisplay = document.getElementById('maxElevationDisplay');
                    if (maxElevationDisplay) maxElevationDisplay.textContent = '';
                    const actualStartTimeDisplay = document.getElementById('actualStartTimeDisplay');
                    if (actualStartTimeDisplay) actualStartTimeDisplay.textContent = '';
                    return null;
                }
            } else {
                this.tracker.addLog('未获取到有效轨迹数据', 'error');
                return null;
            }

            return trajectoryData;
        } catch (error) {
            this.tracker.addLog(`轨迹计算失败: ${error.message}`, 'error');
            console.error('计算完整轨迹失败:', error);
            return null;
        }
    }
    
    // 请求后端计算轨迹
    async requestTrajectoryFromBackend(satellite, groundStation, startTime) {
        try {
            this.tracker.addLog('正在请求后端计算轨迹...');
            
            const requestData = {
                satellite: satellite,
                groundStation: groundStation,
                startTime: startTime.toISOString()
            };
            
            console.log('发送轨迹计算请求:', requestData);
            
            const response = await this.tracker.apiFetch('/api/calculate_trajectory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`后端轨迹计算失败: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('后端轨迹计算结果:', data);
            
            // 显示轨迹计算结果，包括最大仰角信息
            let logMessage = `后端轨迹计算完成: 总点数 ${data.totalPoints}, 可见点数 ${data.visibleCount}`;
            if (data.maxElevation !== undefined) {
                logMessage += `, 最大仰角 ${data.maxElevation}°`;
                const maxElevationDisplay = document.getElementById('maxElevationDisplay');
                if (maxElevationDisplay) {
                    maxElevationDisplay.textContent = `最大仰角: ${data.maxElevation}°`;
                }
            }
            if (data.actualStartTime) {
                const actualStart = new Date(data.actualStartTime);
                if (data.startTime && data.startTime !== data.actualStartTime) { 
                    const foundStart = new Date(data.startTime);
                    logMessage += ` (从 ${actualStart.toLocaleString()} 开始搜索, 在 ${foundStart.toLocaleString()} 找到符合条件的轨迹)`;
                } else {
                    logMessage += ` (轨迹起始时间: ${actualStart.toLocaleString()})`;
                }
                const actualStartTimeDisplay = document.getElementById('actualStartTimeDisplay');
                if (actualStartTimeDisplay) {
                    actualStartTimeDisplay.textContent = `轨迹起始: ${actualStart.toLocaleString()}`;
                }
            }
            this.tracker.addLog(logMessage);
            
            return data;
            
        } catch (error) {
            console.error('后端轨迹计算请求失败:', error);
            this.tracker.addLog(`后端轨迹计算请求失败: ${error.message}`, 'error');
            return null;
        }
    }
    
    startFrontendDisplay(trackingData) {
        // 前端云台指向显示
        this.tracker.trackingInterval = setInterval(async () => {
            if (!this.tracker.isTracking) return;
            
            try {
                const response = await this.tracker.apiFetch('/api/get_current_position');
                if (response.ok) {
                    const data = await response.json();
                    this.updateGimbalDisplay(data.azimuth, data.elevation, data.display_azimuth);

                    if (!data.is_tracking && this.tracker.isTracking) {
                        this.handleBackendTrackingStopped(data);
                        return;
                    }
                    
                    // 预测轨迹方向
                    const trajectoryDirection = this.predictSatelliteTrajectory(data.azimuth);
                    
                    // 在强制时间模式下显示指定时间
                    if (trackingData.simulationMode && data.simulation_time) {
                        const forceTime = new Date(data.simulation_time).toLocaleString('zh-CN');
                        this.tracker.addLog(`[指定时间: ${forceTime}] 方位角: ${data.azimuth.toFixed(2)}°, 仰角: ${data.elevation.toFixed(2)}°, 轨迹: ${trajectoryDirection}`);
                    } else {
                        this.tracker.addLog(`方位角: ${data.azimuth.toFixed(2)}°, 仰角: ${data.elevation.toFixed(2)}°, 轨迹: ${trajectoryDirection}`);
                    }
                }
            } catch (error) {
                console.error('获取当前位置失败:', error);
            }
        }, this.tracker.positionDisplayIntervalMs || 1000);
    }

    handleBackendTrackingStopped(data) {
        this.tracker.isTracking = false;

        if (this.tracker.trackingInterval) {
            clearInterval(this.tracker.trackingInterval);
            this.tracker.trackingInterval = null;
        }

        this.clearGimbalDirectionHint();

        document.getElementById('controlBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;

        let message = '跟踪已停止，云台已复位';
        if (data.stop_reason === 'low_elevation') {
            const elevation = Number(data.stop_elevation);
            const threshold = Number(data.stop_elevation_threshold);
            const elevationText = Number.isFinite(elevation) ? elevation.toFixed(2) : '--';
            const thresholdText = Number.isFinite(threshold) ? threshold.toFixed(1) : '20.0';
            message = `仰角 ${elevationText}° 低于 ${thresholdText}°，已停止跟踪并复位云台`;
        }

        this.tracker.updateStatus(message);
        this.tracker.statusManager.updateStatusDisplay('trackingStatus', '⏹️ 跟踪已停止', 'warning');
        this.tracker.statusManager.updateStatusDisplay('trajectoryStatus', '⏳ 等待搜索轨迹', '');
        this.tracker.statusManager.updateStatusDisplay('calculationStatus', '⏳ 等待计算云台朝向', '');
        this.tracker.addLog(message, 'warning');

        if (this.tracker.elevationDataManager) {
            this.tracker.elevationDataManager.stopCollecting();
            this.tracker.elevationDataManager.updateDownloadButtonState();
        }
    }
    
    predictSatelliteTrajectory(currentAzimuth) {
        // 简化的轨迹预测逻辑
        if (!this.tracker.azimuthHistory) {
            this.tracker.azimuthHistory = [];
        }
        if (!this.tracker.elevationHistory) {
            this.tracker.elevationHistory = [];
        }
        
        this.tracker.azimuthHistory.push(currentAzimuth);
        this.tracker.elevationHistory.push(this.tracker.currentElevation || 0);
        
        // 只保留最近10个数据点
        if (this.tracker.azimuthHistory.length > 10) {
            this.tracker.azimuthHistory.shift();
        }
        if (this.tracker.elevationHistory.length > 10) {
            this.tracker.elevationHistory.shift();
        }
        
        // 需要至少3个数据点才能预测趋势
        if (this.tracker.azimuthHistory.length < 3) {
            return "计算中";
        }
        
        // 计算方位角变化趋势
        const recent = this.tracker.azimuthHistory.slice(-3);
        let azDiff = recent[2] - recent[0];
        
        // 处理方位角跨越0/360度的情况
        if (azDiff > 180) {
            azDiff -= 360;
        } else if (azDiff < -180) {
            azDiff += 360;
        }
        
        // 根据方位角变化和当前位置判断轨迹方向
        if (currentAzimuth >= 0 && currentAzimuth <= 180) { // 东半边
            if (azDiff > 0) { // 方位角增加
                return currentAzimuth > 90 ? "东南" : "东北";
            } else { // 方位角减少
                return currentAzimuth < 90 ? "东北" : "东南";
            }
        } else { // 西半边
            if (azDiff > 0) { // 方位角增加
                return currentAzimuth > 270 ? "西南" : "西北";
            } else { // 方位角减少
                return currentAzimuth < 270 ? "西北" : "西南";
            }
        }
    }
    
    updateGimbalDisplay(azimuth, elevation, displayAzimuth = null) {
        this.tracker.currentAzimuth = azimuth;
        this.tracker.currentElevation = elevation;
        const absoluteAzimuth = Number.isFinite(displayAzimuth) ? displayAzimuth : this.getDisplayAzimuth(azimuth);
        
        // 收集仰角数据（如果正在跟踪）
        if (this.tracker.isTracking && this.tracker.elevationDataManager) {
            this.tracker.elevationDataManager.addDataPoint(azimuth, elevation);
        }
        
        if (this.tracker.gimbal3DView) {
            this.tracker.gimbal3DView.setAngles(absoluteAzimuth, elevation);
        }

        // 更新旧版2D云台指针（WebGL不可用时兜底）
        const pointer = document.getElementById('gimbalPointer');
        
        if (pointer) {
            // 根据仰角计算指针长度：仰角越大，指针越短
            const minLength = 20;
            const maxLength = 80;
            const pointerLength = maxLength - (elevation / 90) * (maxLength - minLength);

            pointer.style.height = `${pointerLength}px`;
            pointer.style.transform = `translate(-50%, -100%) rotate(${azimuth}deg)`;
        }
        
        // 更新角度显示
        document.getElementById('azimuthDisplay').textContent = `${azimuth.toFixed(2)}°`;
        document.getElementById('elevationDisplay').textContent = `${elevation.toFixed(2)}°`;
        
        // 重新绘制雷达图背景和轨迹
        this.tracker.radarDisplay.drawRadarBackground();
        
        // 如果有预测轨迹，重新绘制
        if (this.tracker.lastTrajectoryPoints && this.tracker.lastTrajectoryPoints.length > 0) {
            this.tracker.radarDisplay.drawTrajectoryOnRadar(this.tracker.lastTrajectoryPoints);
        }
        
        // 绘制卫星当前位置
        this.tracker.radarDisplay.drawSatellitePosition(azimuth, elevation, absoluteAzimuth);
    }

    getDisplayAzimuth(azimuth) {
        const gimbalDirection = document.getElementById('gimbalDirection').value;
        let displayAzimuth = azimuth;

        if (gimbalDirection === 'south') {
            displayAzimuth = azimuth + 180;
            if (displayAzimuth >= 360) {
                displayAzimuth -= 360;
            }
        } else if (azimuth < 0) {
            displayAzimuth = azimuth + 360;
        }

        return displayAzimuth;
    }
    
    // 分析轨迹方向和云台朝向建议
    analyzeTrajectoryDirection(visiblePoints) {
        if (!visiblePoints || visiblePoints.length === 0) {
            return {
                maxElevationPoint: null,
                passDirection: "无可见轨迹",
                gimbalDirection: "未知",
                isNorthernPass: false,
                isSouthernPass: false
            };
        }

        // 找到最高仰角点
        const maxElevationPoint = visiblePoints.reduce((max, point) => 
            point.elevation > max.elevation ? point : max, visiblePoints[0]);
        
        // 分析过境方向
        const startPoint = visiblePoints[0];
        const endPoint = visiblePoints[visiblePoints.length - 1];
        
        const startDirection = this.getDirectionHint(startPoint.azimuth);
        const endDirection = this.getDirectionHint(endPoint.azimuth);
        let passDirection = `从${startDirection}向${endDirection}过境`;

        // 如果起点和终点方向相同，可以简化描述
        if (startDirection === endDirection) {
            passDirection = `${startDirection}方向过境`;
        } else if ( (startDirection.includes('北') && endDirection.includes('北')) || 
                    (startDirection.includes('南') && endDirection.includes('南')) ||
                    (startDirection.includes('东') && endDirection.includes('东')) ||
                    (startDirection.includes('西') && endDirection.includes('西')) ) {
            if (startDirection.includes('北') && endDirection.includes('北')) passDirection = "北方过境";
            else if (startDirection.includes('南') && endDirection.includes('南')) passDirection = "南方过境";
            else if (startDirection.includes('东') && endDirection.includes('东')) passDirection = "东方过境";
            else if (startDirection.includes('西') && endDirection.includes('西')) passDirection = "西方过境";
        }

        let gimbalDirection = "";
        const maxAzimuth = maxElevationPoint.azimuth;
        const isNorthernPass = (maxAzimuth >= 315 || maxAzimuth <= 45);
        const isSouthernPass = (maxAzimuth >= 135 && maxAzimuth <= 225);
        
        // 云台朝向建议：检查轨迹是否经过0度或180度
        let crossesNorth = false;
        let crossesSouth = false;
        
        for (let i = 0; i < visiblePoints.length; i++) {
            let azimuth = visiblePoints[i].azimuth;
            if (azimuth < 0) azimuth += 360;
            if (azimuth >= 330 || azimuth <= 30) crossesNorth = true;
            if (azimuth >= 150 && azimuth <= 210) crossesSouth = true;
        }
        
        if (crossesNorth) {
            gimbalDirection = "正北";
        } else if (crossesSouth) {
            gimbalDirection = "正南";
        } else {
            if (maxAzimuth >= 0 && maxAzimuth < 180) gimbalDirection = "正东";
            else gimbalDirection = "正西";
            
            const avgAzimuth = visiblePoints.reduce((sum, p) => sum + (p.azimuth < 0 ? p.azimuth + 360 : p.azimuth), 0) / visiblePoints.length;
            if (avgAzimuth > 0 && avgAzimuth < 180) gimbalDirection = "正东";
            else gimbalDirection = "正西";

            if (isNorthernPass && !isSouthernPass) gimbalDirection = "正北";
            else if (isSouthernPass && !isNorthernPass) gimbalDirection = "正南";
            else if (!((maxAzimuth > 45 && maxAzimuth < 135) || (maxAzimuth > 225 && maxAzimuth < 315))) {
                 gimbalDirection = "正北";
            }
        }
        
        return {
            maxElevationPoint,
            passDirection,
            gimbalDirection,
            isNorthernPass,
            isSouthernPass
        };
    }
    
    // 根据方位角获取朝向建议
    getDirectionHint(azimuth) {
        let normalizedAz = azimuth;
        while (normalizedAz < 0) normalizedAz += 360;
        while (normalizedAz >= 360) normalizedAz -= 360;
        
        if (normalizedAz >= 337.5 || normalizedAz < 22.5) {
            return "正北";
        } else if (normalizedAz >= 22.5 && normalizedAz < 67.5) {
            return "东北";
        } else if (normalizedAz >= 67.5 && normalizedAz < 112.5) {
            return "正东";
        } else if (normalizedAz >= 112.5 && normalizedAz < 157.5) {
            return "东南";
        } else if (normalizedAz >= 157.5 && normalizedAz < 202.5) {
            return "正南";
        } else if (normalizedAz >= 202.5 && normalizedAz < 247.5) {
            return "西南";
        } else if (normalizedAz >= 247.5 && normalizedAz < 292.5) {
            return "正西";
        } else if (normalizedAz >= 292.5 && normalizedAz < 337.5) {
            return "西北";
        }
        
        return "未知方向";
    }
    
    // 在界面上显示云台朝向建议
    updateGimbalDirectionHint(direction, passInfo) {
        let hintElement = document.getElementById('gimbalDirectionHint');
        if (!hintElement) {
            hintElement = document.createElement('div');
            hintElement.id = 'gimbalDirectionHint';
            hintElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                font-size: 16px;
                font-weight: bold;
                z-index: 1000;
                max-width: 300px;
                text-align: center;
                border: 2px solid #fff;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(hintElement);
        }
        
        // 获取用户当前选择的云台朝向
        const userSelectedDirection = document.getElementById('gimbalDirection').value;
        const userDirectionText = userSelectedDirection === 'north' ? '朝北' : '朝南';
        
        // 将建议朝向转换为可比较的格式
        let recommendedDirection = '';
        if (direction.includes('北')) {
            recommendedDirection = 'north';
        } else if (direction.includes('南')) {
            recommendedDirection = 'south';
        } else {
            // 对于东西方向，根据具体情况给出建议
            // 一般来说，东西方向的轨迹建议使用朝北设置
            recommendedDirection = 'north';
        }
        
        // 检查朝向是否一致
        const isDirectionMismatch = userSelectedDirection !== recommendedDirection;
        
        // 构建提示内容
        let warningContent = '';
        if (isDirectionMismatch) {
            const recommendedText = recommendedDirection === 'north' ? '朝北' : '朝南';
            warningContent = `
                <div style="margin-top: 10px; padding: 8px; background: rgba(255, 192, 203, 0.3); border: 1px solid #ff69b4; border-radius: 5px; font-size: 14px;">
                    ⚠️ 朝向不匹配！<br>
                    当前设置: ${userDirectionText}<br>
                    建议设置: ${recommendedText}
                </div>
            `;
        }
        
        hintElement.innerHTML = `
            <div style="margin-bottom: 8px; font-size: 18px;">🎯 云台朝向建议</div>
            <div style="font-size: 20px; margin: 10px 0;">${direction}</div>
            <div style="font-size: 14px; opacity: 0.9;">${passInfo}</div>
            <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">当前设置: ${userDirectionText}</div>
            ${warningContent}
        `;
        
        // 如果朝向不匹配，添加粉红色闪烁效果
        if (isDirectionMismatch) {
            hintElement.style.background = 'linear-gradient(135deg, #ff69b4 0%, #ff1493 100%)';
            hintElement.style.animation = 'pinkFlash 1.5s ease-in-out infinite';
            
            // 添加CSS动画（如果还没有添加）
            if (!document.getElementById('pinkFlashStyle')) {
                const style = document.createElement('style');
                style.id = 'pinkFlashStyle';
                style.textContent = `
                    @keyframes pinkFlash {
                        0%, 100% {
                            background: linear-gradient(135deg, #ff69b4 0%, #ff1493 100%);
                            transform: scale(1);
                        }
                        50% {
                            background: linear-gradient(135deg, #ff1493 0%, #ff69b4 100%);
                            transform: scale(1.02);
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            // 朝向匹配时恢复正常样式
            hintElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            hintElement.style.animation = 'none';
        }
        
        hintElement.style.display = 'block';
    }
    
    // 清除云台朝向建议
    clearGimbalDirectionHint() {
        const hintElement = document.getElementById('gimbalDirectionHint');
        if (hintElement) {
            hintElement.style.display = 'none';
        }
    }
}
