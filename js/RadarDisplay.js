/**
 * 雷达显示模块
 * 负责雷达图的绘制和卫星位置显示
 */
class RadarDisplay {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    // 绘制雷达图背景
    drawRadarBackground() {
        const radarCanvas = document.getElementById('radarCanvas');
        if (!radarCanvas) return;
        
        const ctx = radarCanvas.getContext('2d');
        const centerX = radarCanvas.width / 2;
        const centerY = radarCanvas.height / 2;
        const radius = Math.min(centerX, centerY) - 30;
        
        // 清除画布
        ctx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
        
        // 绘制同心圆（仰角圈）- 增加0度圆圈
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        
        // 绘制仰角圈：0°, 30°, 60°, 90°
        const elevationAngles = [0, 30, 60, 90];
        const colors = ['#777', '#666', '#555', '#444'];
        
        for (let i = 0; i < elevationAngles.length; i++) {
            const elevAngle = elevationAngles[i];
            const circleRadius = radius * (1 - elevAngle / 90);
            
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = elevAngle === 90 ? 2 : (elevAngle === 0 ? 1.5 : 1);
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
            ctx.stroke();
            
            // 添加仰角标签
            if (circleRadius > 10 && elevAngle > 0) {
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${elevAngle}°`, centerX, centerY - circleRadius + 12);
            } else if (elevAngle === 0) {
                // 0度圆圈标签放在外侧
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('0°', centerX, centerY - circleRadius - 8);
            }
        }
        
        // 绘制方位角线（每30度一条）
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let angle = 0; angle < 360; angle += 30) {
            const radian = (angle - 90) * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + radius * Math.cos(radian), centerY + radius * Math.sin(radian));
            ctx.stroke();
        }
        
        // 添加主要方位角标签
        ctx.fillStyle = '#aaa';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        for (let i = 0; i < 8; i++) {
            const angle = i * 45;
            const radian = (angle - 90) * Math.PI / 180;
            const x = centerX + (radius + 20) * Math.cos(radian);
            const y = centerY + (radius + 20) * Math.sin(radian) + 5;
            ctx.fillText(labels[i], x, y);
        }
        
        // 绘制中心点
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // 绘制轨迹到雷达图上
    drawTrajectoryOnRadar(trajectoryPoints) {
        const radarCanvas = document.getElementById('radarCanvas');
        if (!radarCanvas) return;
        
        const ctx = radarCanvas.getContext('2d');
        const centerX = radarCanvas.width / 2;
        const centerY = radarCanvas.height / 2;
        const radius = Math.min(centerX, centerY) - 30;
        
        // 清除之前的轨迹
        this.clearTrajectoryFromRadar();
        
        // 绘制轨迹线
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        let firstPoint = true;
        const visiblePoints = [];
        for (const point of trajectoryPoints) {
            if (point.visible && point.elevation > 0) {
                const r = radius * (1 - point.elevation / 90);
                const angle = (point.azimuth - 90) * Math.PI / 180;
                const x = centerX + r * Math.cos(angle);
                const y = centerY + r * Math.sin(angle);
                
                visiblePoints.push({ x, y, ...point });
                
                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }
        
        ctx.stroke();
        
        // 在轨迹中间绘制方向箭头
        if (visiblePoints.length >= 2) {
            const midIndex = Math.floor(visiblePoints.length / 2);
            if (midIndex > 0 && midIndex < visiblePoints.length - 1) {
                const fromPoint = visiblePoints[midIndex - 1];
                const toPoint = visiblePoints[midIndex + 1];
                this.drawArrow(ctx, fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, '#ff6b6b');
            }
        }
        
        // 标记轨迹起点和终点
        if (visiblePoints.length > 0) {
            // 起点（绿色）
            const startPoint = visiblePoints[0];
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            // 终点（红色）
            const endPoint = visiblePoints[visiblePoints.length - 1];
            ctx.fillStyle = '#f44336';
            ctx.beginPath();
            ctx.arc(endPoint.x, endPoint.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    // 绘制箭头辅助函数（只显示箭头头部，不显示箭头柄）
    drawArrow(ctx, fromX, fromY, toX, toY, color) {
        const headlen = 12; // length of head in pixels
        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);
        
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // 只绘制箭头头部（三角形）
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    // 清除雷达图上的轨迹
    clearTrajectoryFromRadar() {
        // 重新绘制整个雷达图
        this.drawRadarBackground();
    }
    
    // 绘制卫星当前位置
    drawSatellitePosition(azimuth, elevation) {
        const radarCanvas = document.getElementById('radarCanvas');
        if (!radarCanvas || elevation <= 0) return;
        
        const ctx = radarCanvas.getContext('2d');
        const centerX = radarCanvas.width / 2;
        const centerY = radarCanvas.height / 2;
        const radius = Math.min(centerX, centerY) - 30;
        
        // 获取当前云台朝向设置
        const gimbalDirection = document.getElementById('gimbalDirection').value;
        
        // 对于雷达图显示，需要将后端转换后的方位角转换回原始方位角
        let displayAzimuth = azimuth;
        if (gimbalDirection === 'south') {
            // 朝南模式：后端进行了 azimuth - 180 的转换，这里需要逆转换
            displayAzimuth = azimuth + 180;
            if (displayAzimuth >= 360) {
                displayAzimuth -= 360;
            }
        } else if (gimbalDirection === 'north' || gimbalDirection === 'auto') {
            // 朝北模式或自动模式：后端可能进行了 -360 的调整，但原始角度范围保持0-360
            if (azimuth < 0) {
                displayAzimuth = azimuth + 360;
            }
        }
        
        // 计算卫星在雷达图上的位置
        const r = radius * (1 - elevation / 90);
        const angle = (displayAzimuth - 90) * Math.PI / 180;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        
        // 绘制卫星位置（闪烁的圆点）
        const time = Date.now();
        const alpha = 0.5 + 0.5 * Math.sin(time / 200); // 闪烁效果
        
        // 外圈光晕
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fill();
        
        // 中圈
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // 内圈（卫星核心）
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // 添加卫星标识
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🛰️', x, y - 15);
        
        // 显示角度信息
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${azimuth.toFixed(1)}°`, x, y + 25);
        ctx.fillText(`${elevation.toFixed(1)}°`, x, y + 37);
    }
}
