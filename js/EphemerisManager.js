/**
 * 星历数据管理模块
 * 负责下载、解析和管理卫星星历数据
 */
class EphemerisManager {
    constructor(tracker) {
        this.tracker = tracker;
        this.setupLocalFileLoader();
    }

    async loadConstellationOptions() {
        const select = document.getElementById('constellation');
        if (!select) return;

        const selectedValue = select.value || 'x2';

        try {
            const response = await this.tracker.apiFetch('/api/constellations');
            if (!response.ok) {
                throw new Error(`后端星座列表接口失败: ${response.statusText}`);
            }

            const data = await response.json();
            const options = this.normalizeConstellationOptions(data.constellations);
            if (options.length === 0) {
                throw new Error('后端星座列表为空');
            }

            this.renderConstellationOptions(select, options, selectedValue);
            this.tracker.addLog(`已同步后端星座列表，共 ${options.length} 个`);
        } catch (error) {
            this.tracker.addLog(`同步星座列表失败，保留页面默认列表: ${error.message}`, 'error');
        }
    }

    normalizeConstellationOptions(rawOptions) {
        const source = Array.isArray(rawOptions) ? rawOptions : [];
        return source
            .map(item => {
                if (typeof item === 'string') {
                    return {
                        id: item,
                        label: this.tracker.constellationLabels[item] || item
                    };
                }

                if (!item || !item.id) return null;
                return {
                    id: item.id,
                    label: item.label || this.tracker.constellationLabels[item.id] || item.id
                };
            })
            .filter(Boolean);
    }

    renderConstellationOptions(select, options, selectedValue) {
        select.innerHTML = '<option value="">请选择星座</option>';

        options.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.id;
            option.textContent = optionData.label;
            select.appendChild(option);
        });

        const hasPreviousValue = options.some(optionData => optionData.id === selectedValue);
        const hasDefaultX2 = options.some(optionData => optionData.id === 'x2');
        select.value = hasPreviousValue ? selectedValue : (hasDefaultX2 ? 'x2' : options[0].id);
    }
    
    setupLocalFileLoader() {
        // 创建文件选择器
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.tle,.txt';
        fileInput.style.display = 'none';
        fileInput.id = 'tleFileInput';
        document.body.appendChild(fileInput);

        // 创建加载按钮
        const loadButton = document.createElement('button');
        loadButton.textContent = '从本地加载TLE';
        loadButton.className = 'btn btn-secondary';
        loadButton.style.marginTop = '10px';
        loadButton.style.width = '100%';
        loadButton.onclick = () => fileInput.click();

        // 插入到第一个.panel（星历下载与卫星选择面板）
        const panels = document.querySelectorAll('.panel');
        if (panels.length > 0) {
            panels[0].appendChild(loadButton);
        } else {
            document.body.appendChild(loadButton);
        }

        // 监听文件选择
        fileInput.addEventListener('change', (event) => this.handleLocalFile(event));
    }

    async handleLocalFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const progressDiv = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('progressBar');
        
        progressDiv.style.display = 'block';
        progressBar.style.width = '0%';

        try {
            this.tracker.updateStatus('正在读取本地TLE文件...');
            this.tracker.statusManager.updateStatusDisplay('satelliteStatus', '📡 加载卫星', 'warning');
            this.tracker.addLog(`开始读取本地文件: ${file.name}`);

            const text = await file.text();
            progressBar.style.width = '50%';

            // 获取当前选择的星座
            const constellation = document.getElementById('constellation').value;
            if (!constellation) {
                throw new Error('请先选择星座');
            }

            // 处理卫星数据
            await this.processSatellites(constellation, text);
            
            this.tracker.updateStatus(`本地TLE文件处理完成，共 ${this.tracker.satellites.length} 颗卫星`);
            this.tracker.statusManager.updateStatusDisplay('satelliteStatus', '✅ 卫星数据已加载', 'success');
            this.tracker.addLog(`成功加载本地TLE文件，共 ${this.tracker.satellites.length} 颗卫星`);

        } catch (error) {
            this.tracker.addLog(`加载失败: ${error.message}`, 'error');
            this.tracker.updateStatus('加载失败');
        } finally {
            progressDiv.style.display = 'none';
            // 清空文件选择器，允许重复选择同一文件
            event.target.value = '';
        }
    }
    
    async downloadEphemeris(forceRefresh = false) {
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

            let ephemerisData = await this.loadEphemerisFromBackend(constellation, forceRefresh);
            progressBar.style.width = '100%';
            
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

    async loadEphemerisFromBackend(constellation, forceRefresh = false) {
        const refreshParam = forceRefresh ? '?refresh=1' : '';
        try {
            const response = await this.tracker.apiFetch(`/api/ephemeris/${encodeURIComponent(constellation)}${refreshParam}`);
            if (!response.ok) {
                throw new Error(`后端星历接口失败: ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.tle) {
                throw new Error('后端返回的星历数据为空');
            }

            const sourceText = data.source === 'network' ? '网络更新' : '本地缓存';
            this.tracker.addLog(`后端星历加载完成: ${sourceText}`);
            return data.tle;
        } catch (backendError) {
            this.tracker.addLog(`后端星历加载失败，尝试浏览器直连: ${backendError.message}`, 'error');
            return this.loadEphemerisFromBrowser(constellation, forceRefresh);
        }
    }

    async loadEphemerisFromBrowser(constellation, forceRefresh = false) {
        const cacheKey = `ephemeris_${constellation}`;
        const lastUpdate = localStorage.getItem(`${cacheKey}_timestamp`);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;

        const cachedData = localStorage.getItem(cacheKey);
        if (!forceRefresh && cachedData && lastUpdate && (now - parseInt(lastUpdate)) < twentyFourHours) {
            this.tracker.addLog('使用浏览器缓存的星历数据（24小时内已更新）');
            return cachedData;
        }

        const url = this.tracker.constellationUrls[constellation];
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`下载失败: ${response.statusText}`);
        }

        const ephemerisData = await response.text();
        localStorage.setItem(cacheKey, ephemerisData);
        localStorage.setItem(`${cacheKey}_timestamp`, now.toString());

        this.tracker.addLog('浏览器直连星历数据下载完成并已缓存');
        return ephemerisData;
    }
    
    async processSatellites(constellation, ephemerisData) {
        this.tracker.addLog('正在解析和筛选卫星数据...');
        
        const lines = ephemerisData.split('\n');
        const satellites = [];
        
        // 流式处理TLE数据
        for (let i = 0; i < lines.length - 2; i += 3) {
            const name = lines[i].trim();
            const line1 = lines[i + 1].trim();
            const line2 = lines[i + 2].trim();
            
            if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
                const noradId = line1.substring(2, 7).trim();
                const displayName = this.getSatelliteDisplayName(constellation, name, line1);
                // 应用筛选条件
                if (this.shouldIncludeSatellite(constellation, name, noradId, line1, displayName)) {
                    satellites.push({
                        name: displayName,
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
    
    shouldIncludeSatellite(constellation, name, noradId, line1, displayName) {
        switch (constellation) {
            case 'starlink_dtc':
                // 筛选DTC相关的星链卫星
                return name.toLowerCase().includes('dtc') || name.toLowerCase().includes('direct');
            case 'x2':
            case 'x2-3':
                return this.shouldIncludeSpecialSatellite(constellation, name, line1, displayName);
            default:
                return true; // 其他星座不筛选
        }
    }

    shouldIncludeSpecialSatellite(constellation, name, line1, displayName) {
        const config = this.tracker.specialSatelliteConfig[constellation];
        if (!config) return false;

        const intdes = this.getInternationalDesignator(line1);
        const aliases = Object.values(config.aliases || {});
        return (
            (intdes && config.targetIntdes.includes(intdes)) ||
            config.targetNames.includes(name) ||
            config.targetNames.includes(displayName) ||
            aliases.includes(name) ||
            aliases.includes(displayName)
        );
    }

    getSatelliteDisplayName(constellation, sourceName, line1) {
        const config = this.tracker.specialSatelliteConfig[constellation];
        if (!config) return sourceName;

        const intdes = this.getInternationalDesignator(line1);
        if (!intdes) return sourceName;

        if (config.aliases && config.aliases[intdes]) {
            return config.aliases[intdes];
        }

        return config.preferIntdesName ? intdes : sourceName;
    }

    getInternationalDesignator(line1) {
        const parts = line1.trim().split(/\s+/);
        if (parts.length < 3) return '';
        return this.formatInternationalDesignator(parts[2]);
    }

    formatInternationalDesignator(rawIntdes) {
        const raw = rawIntdes.trim().toUpperCase();
        const match = raw.match(/^(\d{2})(\d{3})([A-Z]{1,3})$/);
        if (!match) return raw;

        const year = Number(match[1]);
        const fullYear = year < 57 ? 2000 + year : 1900 + year;
        return `${fullYear}-${match[2]}${match[3]}`;
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
        const constellation = document.getElementById('constellation').value;
        let contentToSave;
        
        // 对于需要筛选的星座，只保存筛选后的卫星数据
        if (constellation === 'starlink_dtc' || this.tracker.specialSatelliteConfig[constellation]) {
            contentToSave = this.tracker.satellites.map(sat => 
                `${sat.name}\n${sat.line1}\n${sat.line2}`
            ).join('\n');
        } else {
            contentToSave = data;
        }
        
        const blob = new Blob([contentToSave], { type: 'text/plain' });
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
