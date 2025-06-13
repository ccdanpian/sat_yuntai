/**
 * 仰角数据管理器
 * 负责收集、显示和下载仰角数据
 */
class ElevationDataManager {
    constructor(tracker) {
        this.tracker = tracker;
        this.elevationData = []; // 存储仰角数据 {time, elevation, azimuth}
        this.isCollecting = false;
        this.chart = null;
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // 下载仰角数据按钮
        const downloadBtn = document.getElementById('downloadElevationBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.showElevationDialog();
            });
        }
        
        // 关闭对话框按钮
        const closeBtn = document.getElementById('closeElevationDialogBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideElevationDialog();
            });
        }
        
        // 下载CSV按钮
        const csvBtn = document.getElementById('downloadCsvBtn');
        if (csvBtn) {
            csvBtn.addEventListener('click', () => {
                this.downloadCsv();
            });
        }
        
        // 清空数据按钮已移除
    }
    
    // 开始收集数据（保留用于实时数据收集）
    startCollecting() {
        this.isCollecting = true;
        this.elevationData = [];
        this.tracker.addLog('开始收集实时仰角数据');
    }
    
    // 停止收集数据（保留用于实时数据收集）
    stopCollecting() {
        this.isCollecting = false;
        this.tracker.addLog(`实时仰角数据收集完成，共收集 ${this.elevationData.length} 个数据点`);
    }
    
    // 更新下载按钮状态
    updateDownloadButtonState() {
        const downloadBtn = document.getElementById('downloadElevationBtn');
        if (downloadBtn) {
            const hasTrajectoryData = this.tracker.lastTrajectoryPoints && 
                                    this.tracker.lastTrajectoryPoints.length > 0 &&
                                    this.tracker.lastTrajectoryPoints.some(point => point.visible);
            downloadBtn.disabled = !hasTrajectoryData;
        }
    }
    
    // 添加数据点
    addDataPoint(azimuth, elevation) {
        if (!this.isCollecting) return;
        
        const now = new Date();
        const dataPoint = {
            time: now,
            timeString: now.toLocaleTimeString('zh-CN', { hour12: false }),
            elevation: elevation,
            azimuth: azimuth
        };
        
        this.elevationData.push(dataPoint);
        
        // 限制数据点数量，避免内存过大
        if (this.elevationData.length > 1000) {
            this.elevationData.shift();
        }
    }
    
    // 显示仰角数据对话框
    showElevationDialog() {
        // 使用轨迹预测数据而不是实时收集的数据
        if (!this.tracker.lastTrajectoryPoints || this.tracker.lastTrajectoryPoints.length === 0) {
            alert('暂无轨迹数据，请先开始跟踪卫星并等待轨迹计算完成');
            return;
        }
        
        const dialog = document.getElementById('elevationDataDialog');
        if (dialog) {
            dialog.style.display = 'block';
            this.drawTrajectoryChart();
            this.updateTrajectoryDataTable();
        }
    }
    
    // 隐藏仰角数据对话框
    hideElevationDialog() {
        const dialog = document.getElementById('elevationDataDialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
    }
    
    // 绘制轨迹仰角图表
    drawTrajectoryChart() {
        const canvas = document.getElementById('elevationChart');
        if (!canvas || !this.tracker.lastTrajectoryPoints || this.tracker.lastTrajectoryPoints.length === 0) return;
        
        const trajectoryData = this.tracker.lastTrajectoryPoints.filter(point => point.visible); // 只显示可见部分
        if (trajectoryData.length === 0) {
            this.drawEmptyChart('暂无可见轨迹数据');
            return;
        }
        
        // 设置canvas尺寸以适应容器
        const containerWidth = canvas.parentElement.clientWidth - 30; // 减去padding
        canvas.width = containerWidth;
        canvas.height = 300;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;
        
        // 清除画布
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // 计算数据范围
        const elevations = trajectoryData.map(d => d.elevation);
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const elevationRange = Math.max(maxElevation - minElevation, 10); // 最小范围10度
        
        const times = trajectoryData.map(d => new Date(d.time).getTime());
        const startTime = Math.min(...times);
        const endTime = Math.max(...times);
        const timeRange = endTime - startTime;
        
        // 绘制坐标轴
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Y轴
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        // X轴
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // 绘制Y轴刻度和标签（仰角）
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        
        for (let i = 0; i <= 5; i++) {
            const elevation = minElevation + (elevationRange * i / 5);
            const y = height - padding - (i / 5) * (height - 2 * padding);
            
            // 刻度线
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding - 5, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            
            // 标签
            ctx.fillText(`${elevation.toFixed(1)}°`, padding - 10, y + 4);
        }
        
        // 绘制X轴刻度和标签（时间）
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const time = startTime + (timeRange * i / 5);
            const x = padding + (i / 5) * (width - 2 * padding);
            const timeStr = new Date(time).toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
            });
            
            // 刻度线
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, height - padding + 5);
            ctx.lineTo(x, padding);
            ctx.stroke();
            
            // 标签
            ctx.fillText(timeStr, x, height - padding + 20);
        }
        
        // 绘制仰角曲线
        if (trajectoryData.length > 1) {
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < trajectoryData.length; i++) {
                const point = trajectoryData[i];
                const pointTime = new Date(point.time).getTime();
                const x = padding + ((pointTime - startTime) / timeRange) * (width - 2 * padding);
                const y = height - padding - ((point.elevation - minElevation) / elevationRange) * (height - 2 * padding);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            // 绘制数据点
            ctx.fillStyle = '#ff6b6b';
            for (let i = 0; i < trajectoryData.length; i++) {
                const point = trajectoryData[i];
                const pointTime = new Date(point.time).getTime();
                const x = padding + ((pointTime - startTime) / timeRange) * (width - 2 * padding);
                const y = height - padding - ((point.elevation - minElevation) / elevationRange) * (height - 2 * padding);
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        
        // 绘制轴标签
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('时间', width / 2, height - 5);
    }
    
    // 绘制空图表
    drawEmptyChart(message) {
        const canvas = document.getElementById('elevationChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // 清除画布
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // 显示消息
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(message, width / 2, height / 2);
    }
    
    // 绘制实时收集的仰角图表（保留原方法）
    drawChart() {
        const canvas = document.getElementById('elevationChart');
        if (!canvas || this.elevationData.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;
        
        // 清除画布
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // 计算数据范围
        const minElevation = Math.min(...this.elevationData.map(d => d.elevation));
        const maxElevation = Math.max(...this.elevationData.map(d => d.elevation));
        const elevationRange = Math.max(maxElevation - minElevation, 10); // 最小范围10度
        
        const startTime = this.elevationData[0].time.getTime();
        const endTime = this.elevationData[this.elevationData.length - 1].time.getTime();
        const timeRange = endTime - startTime;
        
        // 绘制坐标轴
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Y轴
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        // X轴
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // 绘制Y轴刻度和标签（仰角）
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        
        for (let i = 0; i <= 5; i++) {
            const elevation = minElevation + (elevationRange * i / 5);
            const y = height - padding - (i / 5) * (height - 2 * padding);
            
            // 刻度线
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding - 5, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            
            // 标签
            ctx.fillText(`${elevation.toFixed(1)}°`, padding - 10, y + 4);
        }
        
        // 绘制X轴刻度和标签（时间）
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const time = startTime + (timeRange * i / 5);
            const x = padding + (i / 5) * (width - 2 * padding);
            const timeStr = new Date(time).toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
            });
            
            // 刻度线
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, height - padding + 5);
            ctx.lineTo(x, padding);
            ctx.stroke();
            
            // 标签
            ctx.fillText(timeStr, x, height - padding + 20);
        }
        
        // 绘制仰角曲线
        if (this.elevationData.length > 1) {
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < this.elevationData.length; i++) {
                const point = this.elevationData[i];
                const x = padding + ((point.time.getTime() - startTime) / timeRange) * (width - 2 * padding);
                const y = height - padding - ((point.elevation - minElevation) / elevationRange) * (height - 2 * padding);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            // 绘制数据点
            ctx.fillStyle = '#ff6b6b';
            for (let i = 0; i < this.elevationData.length; i++) {
                const point = this.elevationData[i];
                const x = padding + ((point.time.getTime() - startTime) / timeRange) * (width - 2 * padding);
                const y = height - padding - ((point.elevation - minElevation) / elevationRange) * (height - 2 * padding);
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        
        // 绘制标题和轴标签
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('仰角随时间变化图', width / 2, 25);
        
        ctx.font = '14px Arial';
        ctx.fillText('时间', width / 2, height - 5);
        
        // Y轴标签（旋转90度）
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('仰角 (度)', 0, 0);
        ctx.restore();
    }
    
    // 更新轨迹数据表格
    updateTrajectoryDataTable() {
        const tableDiv = document.getElementById('elevationDataTable');
        if (!tableDiv) return;
        
        if (!this.tracker.lastTrajectoryPoints || this.tracker.lastTrajectoryPoints.length === 0) {
            tableDiv.innerHTML = '暂无轨迹数据';
            return;
        }
        
        const trajectoryData = this.tracker.lastTrajectoryPoints.filter(point => point.visible); // 只显示可见部分
        if (trajectoryData.length === 0) {
            tableDiv.innerHTML = '暂无可见轨迹数据';
            return;
        }
        
        let html = '<table style="width: 100%; border-collapse: collapse; color: #333;">';
        html += '<tr style="background-color: #f0f0f0;">';
        html += '<th style="padding: 8px; border: 1px solid #ccc; text-align: left; color: #333;">时间</th>';
        html += '<th style="padding: 8px; border: 1px solid #ccc; text-align: left; color: #333;">仰角 (°)</th>';
        html += '<th style="padding: 8px; border: 1px solid #ccc; text-align: left; color: #333;">方位角 (°)</th>';
        html += '<th style="padding: 8px; border: 1px solid #ccc; text-align: left; color: #333;">距离 (km)</th>';
        html += '</tr>';
        
        // 显示所有轨迹数据点，但限制显示数量避免页面过长
        const displayData = trajectoryData.length > 100 ? 
            trajectoryData.filter((_, index) => index % Math.ceil(trajectoryData.length / 100) === 0) : 
            trajectoryData;
        
        for (const point of displayData) {
            const timeStr = new Date(point.time).toLocaleTimeString('zh-CN', { hour12: false });
            html += '<tr>';
            html += `<td style="padding: 8px; border: 1px solid #ccc; color: #333;">${timeStr}</td>`;
            html += `<td style="padding: 8px; border: 1px solid #ccc; color: #333;">${point.elevation.toFixed(2)}</td>`;
            html += `<td style="padding: 8px; border: 1px solid #ccc; color: #333;">${point.azimuth.toFixed(2)}</td>`;
            html += `<td style="padding: 8px; border: 1px solid #ccc; color: #333;">${point.range ? point.range.toFixed(1) : 'N/A'}</td>`;
            html += '</tr>';
        }
        
        html += '</table>';
        
        if (trajectoryData.length > displayData.length) {
            html += `<p style="margin-top: 10px; color: #666;">显示${displayData.length}条记录（已简化），轨迹总计${trajectoryData.length}个数据点</p>`;
        } else {
            html += `<p style="margin-top: 10px; color: #666;">轨迹总计${trajectoryData.length}个数据点</p>`;
        }
        
        tableDiv.innerHTML = html;
    }
    
    // 更新实时收集的数据表格（保留原方法）
    updateDataTable() {
        const tableDiv = document.getElementById('elevationDataTable');
        if (!tableDiv) return;
        
        if (this.elevationData.length === 0) {
            tableDiv.innerHTML = '暂无数据';
            return;
        }
        
        let html = '<table style="width: 100%; border-collapse: collapse;">';
        html += '<tr style="background: #ddd; font-weight: bold;">';
        html += '<td style="padding: 5px; border: 1px solid #ccc;">时间</td>';
        html += '<td style="padding: 5px; border: 1px solid #ccc;">仰角 (°)</td>';
        html += '<td style="padding: 5px; border: 1px solid #ccc;">方位角 (°)</td>';
        html += '</tr>';
        
        // 只显示最近的50个数据点
        const displayData = this.elevationData.slice(-50);
        
        for (const point of displayData) {
            html += '<tr>';
            html += `<td style="padding: 5px; border: 1px solid #ccc;">${point.timeString}</td>`;
            html += `<td style="padding: 5px; border: 1px solid #ccc;">${point.elevation.toFixed(2)}</td>`;
            html += `<td style="padding: 5px; border: 1px solid #ccc;">${point.azimuth.toFixed(2)}</td>`;
            html += '</tr>';
        }
        
        html += '</table>';
        
        if (this.elevationData.length > 50) {
            html += `<p style="margin-top: 10px; color: #666;">显示最近50条记录，共${this.elevationData.length}条记录</p>`;
        }
        
        tableDiv.innerHTML = html;
    }
    
    // 下载CSV文件
    downloadCsv() {
        if (!this.tracker.lastTrajectoryPoints || this.tracker.lastTrajectoryPoints.length === 0) {
            alert('暂无轨迹数据可下载');
            return;
        }
        
        const trajectoryData = this.tracker.lastTrajectoryPoints.filter(point => point.visible);
        if (trajectoryData.length === 0) {
            alert('暂无可见轨迹数据可下载');
            return;
        }
        
        // 生成CSV内容
        let csvContent = '时间,仰角(度),方位角(度),距离(km),可见性\n';
        
        for (const point of trajectoryData) {
            const timeStr = new Date(point.time).toLocaleString('zh-CN', { hour12: false });
            const range = point.range ? point.range.toFixed(3) : 'N/A';
            csvContent += `${timeStr},${point.elevation.toFixed(3)},${point.azimuth.toFixed(3)},${range},${point.visible ? '可见' : '不可见'}\n`;
        }
        
        // 创建下载链接
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            // 生成文件名
            const now = new Date();
            const filename = `satellite_trajectory_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}.csv`;
            link.setAttribute('download', filename);
            
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.tracker.addLog(`卫星轨迹数据已下载: ${filename}`);
        }
    }
    
    // 清空数据
    clearData() {
        if (confirm('确定要清空轨迹数据显示吗？这将清空当前显示的轨迹数据。')) {
            // 清空轨迹数据
            this.tracker.lastTrajectoryPoints = null;
            
            // 更新显示
            this.updateTrajectoryDataTable();
            this.drawEmptyChart('轨迹数据已清空');
            
            // 重新绘制雷达背景（清除轨迹显示）
            this.tracker.radarDisplay.drawRadarBackground();
            
            this.tracker.addLog('轨迹数据显示已清空');
        }
    }
    
    // 获取数据统计信息
    getDataStats() {
        if (this.elevationData.length === 0) {
            return null;
        }
        
        const elevations = this.elevationData.map(d => d.elevation);
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const avgElevation = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
        
        return {
            count: this.elevationData.length,
            minElevation: minElevation,
            maxElevation: maxElevation,
            avgElevation: avgElevation,
            startTime: this.elevationData[0].time,
            endTime: this.elevationData[this.elevationData.length - 1].time
        };
    }
}
