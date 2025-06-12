/**
 * 星历数据管理模块
 * 负责下载、解析和管理卫星星历数据
 */
class EphemerisManager {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    async downloadEphemeris() {
        const constellation = document.getElementById('constellation').value;
        if (!constellation) {
            this.tracker.addLog('请先选择星座', 'error');
            return;
        }
        
        const progressDiv = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('progressBar');
        
        progressDiv.style.display = 'block';
        progressBar.style.width = '0%';
        
        try {
            this.tracker.updateStatus(`正在下载 ${constellation} 星历数据...`);
            this.tracker.statusManager.updateStatusDisplay('satelliteStatus', '📡 加载卫星', 'warning');
            this.tracker.addLog(`开始下载 ${constellation} 星历数据`);
            
            // 检查缓存
            const cacheKey = `ephemeris_${constellation}`;
            const lastUpdate = localStorage.getItem(`${cacheKey}_timestamp`);
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            
            let ephemerisData;
            
            if (lastUpdate && (now - parseInt(lastUpdate)) < twentyFourHours) {
                this.tracker.addLog('使用缓存的星历数据（24小时内已更新）');
                ephemerisData = localStorage.getItem(cacheKey);
                progressBar.style.width = '100%';
            } else {
                // 前端直接下载星历数据
                const url = this.tracker.constellationUrls[constellation];
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`下载失败: ${response.statusText}`);
                }
                
                ephemerisData = await response.text();
                progressBar.style.width = '100%';
                
                // 保存到缓存
                localStorage.setItem(cacheKey, ephemerisData);
                localStorage.setItem(`${cacheKey}_timestamp`, now.toString());
                
                this.tracker.addLog('星历数据下载完成并已缓存');
            }
            
            // 解析和筛选卫星
            await this.processSatellites(constellation, ephemerisData);
            
            this.tracker.updateStatus(`${constellation} 星历数据处理完成，共 ${this.tracker.satellites.length} 颗卫星`);
            this.tracker.statusManager.updateStatusDisplay('satelliteStatus', '✅ 卫星数据已加载', 'success');
            
            // 可选保存到文件
            if (document.getElementById('saveToFile').checked) {
                this.saveToFile(ephemerisData, `${constellation}_ephemeris.tle`);
            }
            
        } catch (error) {
            this.tracker.addLog(`下载失败: ${error.message}`, 'error');
            this.tracker.updateStatus('下载失败');
        } finally {
            progressDiv.style.display = 'none';
        }
    }
    
    async processSatellites(constellation, ephemerisData) {
        this.tracker.addLog('正在解析和筛选卫星数据...');
        
        const lines = ephemerisData.split('\n');
        const satellites = [];
        
        // 流式处理TLE数据
        for (let i = 0; i < lines.length - 2; i += 3) {
            const name = lines[i].trim();
            const line1 = lines[i + 1];
            const line2 = lines[i + 2];
            
            if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
                const noradId = line1.substring(2, 7).trim();
                // 应用筛选条件
                if (this.shouldIncludeSatellite(constellation, name, noradId)) {
                    satellites.push({
                        name: name,
                        line1: line1,
                        line2: line2,
                        noradId: noradId
                    });
                }
            }
        }
        
        this.tracker.satellites = satellites;
        this.populateSatelliteDropdown();
        this.tracker.addLog(`筛选完成，共 ${satellites.length} 颗卫星`);
    }
    
    shouldIncludeSatellite(constellation, name, noradId) {
        switch (constellation) {
            case 'starlink_dtc':
                // 筛选DTC相关的星链卫星
                return name.toLowerCase().includes('dtc') || name.toLowerCase().includes('direct');
            case 'x2':
                // 只筛选指定的X2卫星编号
                const x2Satellites = ['2025-067A', '2025-067B', '2025-067C', '2025-067D'];
                return x2Satellites.some(id => name.includes(id));
            default:
                return true; // 其他星座不筛选
        }
    }
    
    populateSatelliteDropdown() {
        const satelliteSelect = document.getElementById('satellite');
        satelliteSelect.innerHTML = '<option value="">请选择卫星</option>';
        
        this.tracker.satellites.forEach((sat, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${sat.name} (${sat.noradId})`;
            satelliteSelect.appendChild(option);
        });
        
        satelliteSelect.disabled = false;
        satelliteSelect.addEventListener('change', () => {
            document.getElementById('controlBtn').disabled = satelliteSelect.value === '';
        });
    }
    
    saveToFile(data, filename) {
        const blob = new Blob([data], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.tracker.addLog(`文件已保存: ${filename}`);
    }
    
    clearSatelliteList() {
        const satelliteSelect = document.getElementById('satellite');
        satelliteSelect.innerHTML = '<option value="">请先下载星历数据</option>';
        satelliteSelect.disabled = true;
        document.getElementById('controlBtn').disabled = true;
        this.tracker.satellites = [];
    }
    
    // 自动下载x2星座星历数据
    async autoDownloadX2Ephemeris() {
        try {
            // 等待页面完全加载
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                }
            });
            
            // 确保x2星座已选中
            const constellationSelect = document.getElementById('constellation');
            if (constellationSelect && constellationSelect.value === 'x2') {
                this.tracker.addLog('自动开始下载X2星座星历数据');
                await this.downloadEphemeris();
            }
        } catch (error) {
            this.tracker.addLog(`自动下载星历失败: ${error.message}`, 'error');
        }
    }
    
    // 星座选择变化时自动下载星历
    async autoDownloadOnConstellationChange() {
        try {
            const constellation = document.getElementById('constellation').value;
            if (constellation && constellation !== '') {
                this.tracker.addLog(`选择了${constellation}星座，自动开始下载星历数据`);
                await this.downloadEphemeris();
            }
        } catch (error) {
            this.tracker.addLog(`自动下载星历失败: ${error.message}`, 'error');
        }
    }
}
