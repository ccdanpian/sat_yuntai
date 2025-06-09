// visualization.js

if (typeof THREE === 'undefined') {
    console.error('Three.js 未加载，可视化将无法工作');
} else {
    console.log('Three.js 已成功加载，版本:', THREE.REVISION);
}

let scene, camera, renderer, earth, satellites = [], orbit, userMarker, projectionLines = [];
let animationReady = false;
let isVisualizationInitialized = false;
let coneMesh;

// 添加这个常量在文件的顶部
const EARTH_RADIUS = 6371; // 地球半径，单位：公里

// 确保这个函数在文件中被定义
function initVisualization() {
    console.log('开始初始化可视化');
    
    if (typeof THREE === 'undefined') {
        console.error('Three.js 未定义，无法初始化可视化');
        return;
    }

    if (!THREE.WebGLRenderer) {
        console.error('THREE.WebGLRenderer 不可用，您的浏览器可能不支持 WebGL');
        return;
    }

    // 检查 WebGL 是否可用
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            throw new Error('WebGL not supported');
        }
    } catch (e) {
        console.error('WebGL 不可用:', e);
        return;
    }

    scene = new THREE.Scene();
    console.log('场景建完成');
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    console.log('相机创建完成');
    renderer = new THREE.WebGLRenderer();
    console.log('渲染器创建完成');
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('visualization').appendChild(renderer.domElement);
    console.log('渲染器添加到DOM');

    // 测试渲染
    const testGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const testMaterial = new THREE.MeshBasicMaterial({color: 0xADD8E6});
    const testSphere = new THREE.Mesh(testGeometry, testMaterial);
    scene.add(testSphere);
    renderer.render(scene, camera);
    console.log('测试渲染完成');

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.zoomSpeed = 0.2; // 添加这行，默认值是 1.0
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    // 创建地球
    const earthGeometry = new THREE.SphereGeometry(1, 32, 32);
    const earthMaterial = new THREE.MeshPhongMaterial({
        color: 0x2233ff,
        transparent: true,
        opacity: 0.7
    });
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // 添加环境光和平行光
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // 创建轨道
    const orbitGeometry = new THREE.BufferGeometry();
    const orbitMaterial = new THREE.LineBasicMaterial({color: 0xFFFFFF});
    orbit = new THREE.Line(orbitGeometry, orbitMaterial);
    scene.add(orbit);

    camera.position.z = 8;
    console.log('相机位置设置完成');

    // 创建用户位置标记（调小）
    const userGeometry = new THREE.SphereGeometry(0.005, 32, 32); // 半径从 0.01 减小到 0.005
    const userMaterial = new THREE.MeshBasicMaterial({color: 0xFFFF00});
    userMarker = new THREE.Mesh(userGeometry, userMaterial);
    userMarker.visible = false;
    scene.add(userMarker);

    console.log('可视化初始化完成');
    animationReady = true;  // 标记初始化完成
    animate();  // 在初始化完成后开始动画循环
    
    loadCountries();

    document.getElementById('update-cone').addEventListener('click', updateCone);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (animationReady && userMarker) {
        if (userMarker.visible) {
            userMarker.quaternion.copy(camera.quaternion);
        }
    }
    
    renderer.render(scene, camera);
}

function loadCountries() {
    console.log('开始加载国家');
    fetch('/static/js/ne_110m_admin_0_countries.geojson')
        .then(response => response.json())
        .then(data => {
            console.log('国家数据加载成功,开始绘制边界');
            const countriesGroup = new THREE.Group();
            data.features.forEach(feature => {
                if (feature.geometry.type === "Polygon") {
                    feature.geometry.coordinates.forEach(coord => {
                        drawCountryBorder(coord, countriesGroup);
                    });
                } else if (feature.geometry.type === "MultiPolygon") {
                    feature.geometry.coordinates.forEach(polygon => {
                        polygon.forEach(coord => {
                            drawCountryBorder(coord, countriesGroup);
                        });
                    });
                }
            });
            scene.add(countriesGroup);
            console.log('国家边界绘制完成');
        })
        .catch(error => {
            console.error('加载国家数据时出错:', error);
        });
}

function drawCountryBorder(coordinates, group) {
    const points = [];
    coordinates.forEach(coord => {
        const point = latLonToVector3(coord[1], coord[0], 1.001);
        points.push(point);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(geometry, material);
    group.add(line);
}

function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    return new THREE.Vector3(x, y, z);
}

function updateVisualization(data, userPosition) {
    console.log('开始更新可视化,数据点数量:', data.length);
    
    if (!orbit || !scene) {
        console.error('轨道对象或场景未初始化');
        return;
    }

    // 移除现有的卫星和投影线
    satellites.forEach(satellite => scene.remove(satellite));
    projectionLines.forEach(line => scene.remove(line));
    satellites = [];
    projectionLines = [];

    // 更新用户位置
    if (userPosition) {
        const userVector = latLonToVector3(userPosition.lat, userPosition.lon, 1.001);
        userMarker.position.copy(userVector);
        userMarker.visible = true;
        console.log('用户位置已更新:', userPosition);
        updateCone();  // 更新圆锥体位置
    } else {
        userMarker.visible = false;
        console.log('未提供用户位置');
    }

    // 按卫星编号分组存储数据
    const satelliteGroups = new Map();
    
    // 处理卫星数据
    data.forEach((satellite, index) => {
        if (!satellite.lat_sat || !satellite.lon_sat || !satellite.alt_sat) {
            console.error(`卫星 ${index + 1} 数据不完整，跳过`);
            return;
        }

        const lat = satellite.lat_sat * Math.PI / 180;
        const lon = satellite.lon_sat * Math.PI / 180;
        const radius = 1 + satellite.alt_sat / 6371;

        const x = radius * Math.cos(lat) * Math.cos(lon);
        const y = radius * Math.cos(lat) * Math.sin(lon);
        const z = radius * Math.sin(lat);

        const position = new THREE.Vector3(x, z, -y);
        
        // 按卫星编号分组
        if (!satelliteGroups.has(satellite.satellite_name)) {
            satelliteGroups.set(satellite.satellite_name, []);
        }
        satelliteGroups.get(satellite.satellite_name).push({
            position: position,
            time: new Date(satellite.time),
            isFirstPoint: false  // 添加标记，稍后更新
        });
    });

    // 标记每个卫星组中最早的点
    satelliteGroups.forEach(points => {
        points.sort((a, b) => a.time - b.time);
        if (points.length > 0) {
            points[0].isFirstPoint = true;
        }
    });

    // 创建卫星点
    satelliteGroups.forEach((points, satelliteName) => {
        points.forEach(data => {
            const satelliteGeometry = new THREE.SphereGeometry(0.005, 16, 16);
            const color = data.isFirstPoint ? 0xFFA500 : 0xFF0000; // 最早的点使用橙黄色
            const satelliteMaterial = new THREE.MeshBasicMaterial({color: color});
            const satelliteMesh = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
            satelliteMesh.position.copy(data.position);
            scene.add(satelliteMesh);
            satellites.push(satelliteMesh);

            // 为最早的点添加卫星编号标签
            if (data.isFirstPoint) {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = 128;
                canvas.height = 64;
                context.font = 'Bold 12px Arial';
                context.fillStyle = '#FFA500';
                context.textAlign = 'center';
                context.fillText(satelliteName, 64, 32);

                const texture = new THREE.CanvasTexture(canvas);
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true
                });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.scale.set(0.2, 0.1, 1);
                sprite.position.copy(data.position);
                sprite.position.multiplyScalar(1.05); // 将标签稍微移出一点
                scene.add(sprite);
                satellites.push(sprite); // 将标签也加入satellites数组以便清除
            }

            // 创建投影线（保持原有代码）
            const groundPosition = data.position.clone().normalize();
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([data.position, groundPosition]);
            const distanceToSurface = data.position.length() - 1;
            const dashSize = Math.min(0.02, distanceToSurface / 100);
            const gapSize = Math.min(0.01, distanceToSurface / 200);
            const lineMaterial = new THREE.LineDashedMaterial({
                color: 0xFFFFFF,
                dashSize: dashSize,
                gapSize: gapSize,
                scale: 1,
            });
            const projectionLine = new THREE.Line(lineGeometry, lineMaterial);
            projectionLine.computeLineDistances();
            scene.add(projectionLine);
            projectionLines.push(projectionLine);
        });
    });

    // 为每个卫星创建相邻时间点之间的连线
    satelliteGroups.forEach((positionData, satelliteName) => {
        // 按时间排序
        positionData.sort((a, b) => a.time - b.time);
        
        // 创建相邻点之间的连线
        for (let i = 0; i < positionData.length - 1; i++) {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                positionData[i].position,
                positionData[i + 1].position
            ]);
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
            const satLine = new THREE.Line(lineGeometry, lineMaterial);
            scene.add(satLine);
        }

        // 为最后一个点添加延伸线
        /* 
        if (positionData.length >= 2) {
            const lastPoint = positionData[positionData.length - 1].position;
            const prevPoint = positionData[positionData.length - 2].position;
            const direction = lastPoint.clone().sub(prevPoint).normalize();
            const extendedPoint = lastPoint.clone().add(direction.multiplyScalar(0.05));
            
            const directionLineGeometry = new THREE.BufferGeometry().setFromPoints([
                lastPoint,
                extendedPoint
            ]);
            const directionLineMaterial = new THREE.LineBasicMaterial({ 
                color: 0xffffff,
                opacity: 0.5,
                transparent: true
            });
            const directionLine = new THREE.Line(directionLineGeometry, directionLineMaterial);
            scene.add(directionLine);
        }
        */
    });

    console.log(`创建了 ${satellites.length} 个卫星`);

    // 更新覆盖范围（如果有的话）
    if (data.coverage) {
        // ... 覆盖范围的代码 ...
    }

    console.log('可视化更新完成');
}

// 响应式设计
window.addEventListener('resize', function() {
    if (renderer) {
        renderer.setSize(document.getElementById('visualization').clientWidth, 600);
        camera.aspect = document.getElementById('visualization').clientWidth / 600;
        camera.updateProjectionMatrix();
    }
});

// 添加获取用户位置的函数
function getUserPosition() {
    const positionSourceElement = document.getElementById('position-source');
    if (!positionSourceElement) {
        console.error('未找到 position-source 元素');
        return null;
    }

    const positionSource = positionSourceElement.value;
    if (positionSource === '查找卫星参数') {
        const latElement = document.getElementById('lat_ue');
        const lonElement = document.getElementById('lon_ue');
        const altElement = document.getElementById('alt_ue');
        if (!latElement || !lonElement || !altElement) {
            console.error('未找到用户位置输入元素');
            return null;
        }
        const lat = parseFloat(latElement.value);
        const lon = parseFloat(lonElement.value);
        const alt = parseFloat(altElement.value);
        if (isNaN(lat) || isNaN(lon) || isNaN(alt)) {
            console.error('无效的用户位置数据');
            return null;
        }
        return {lat, lon, alt};
    } else if (positionSource === '浏览器地理位置') {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('浏览器不支持地理位置'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    alt: position.coords.altitude || 0
                }),
                error => reject(error)
            );
        });
    } else {
        console.error('未知的位置来源');
        return null;
    }
}

function initializeEventListeners() {
    const calculateButton = document.getElementById('calculate-button');
    if (calculateButton) {
        calculateButton.addEventListener('click', handleCalculateClick);
    } else {
        console.error('未找到 calculate-button 元素');
    }

    // 为数据表格添加点击事件监听器
    const dataTable = document.getElementById('resultsTable');
    if (dataTable) {
        dataTable.addEventListener('click', handleDataPointClick);
        console.log('成功为数据表格添加点击事件监听器');
    } else {
        console.error('未找到 resultsTable 元素，请检查 HTML 结构');
    }

    // 在这里添加其他的事件监听器...
}

function handleCalculateClick() {
    console.log('开始处理计算点击事件');
    if (!isVisualizationInitialized) {
        console.log('初始化可视化');
        initVisualization();
        isVisualizationInitialized = true;
    } else {
        console.log('可视化已初始化');
    }

}

function createCone(apex, azimuth, elevation, height, angle) {
    const scaledHeight = height / EARTH_RADIUS;
    const group = new THREE.Group();

    // 创建大圆锥体
    const radiusBottom = scaledHeight * Math.tan(angle);
    const coneGeometry = new THREE.ConeGeometry(radiusBottom, scaledHeight, 32);
    const coneMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false  // 禁用深度写入
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(0, scaledHeight / 2, 0);
    cone.rotation.x = Math.PI;

    // 创建小圆锥体
    const smallAngle = 1.8 * Math.PI / 180;
    const smallRadiusBottom = scaledHeight * Math.tan(smallAngle);
    const smallConeGeometry = new THREE.ConeGeometry(smallRadiusBottom, scaledHeight * 0.98, 32);
    const smallConeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: true  // 启用深度写入
    });
    const smallCone = new THREE.Mesh(smallConeGeometry, smallConeMaterial);
    smallCone.position.set(0, scaledHeight / 2 + 0.001, 0);
    smallCone.rotation.x = Math.PI;

    // 创建底面小圆
    const smallCircleRadius = radiusBottom * 0.2;
    const smallCircleGeometry = new THREE.CircleGeometry(smallCircleRadius, 32);
    const smallCircleMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false  // 禁用深度写入
    });
    const smallCircle = new THREE.Mesh(smallCircleGeometry, smallCircleMaterial);
    smallCircle.position.set(0, -scaledHeight / 2, 0);
    smallCircle.rotation.x = Math.PI / 2;

    // 添加边缘线以增强可见性
    const edges = new THREE.EdgesGeometry(coneGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.1 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    cone.add(wireframe);

    const smallEdges = new THREE.EdgesGeometry(smallConeGeometry);
    const smallLineMaterial = new THREE.LineBasicMaterial({ color: 0xFF00FF, transparent: true, opacity: 0.1 });
    const smallWireframe = new THREE.LineSegments(smallEdges, smallLineMaterial);
    smallCone.add(smallWireframe);

    group.add(cone);
    group.add(smallCone);
    group.add(smallCircle);

    // 计算用户位置的法线方向（指向天顶）
    const up = apex.clone().normalize();

    // 计算东方向量
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();

    // 计算北方向量
    const north = up.clone().cross(east).normalize();

    // 创建一个基于用户位置的本地坐标系
    const localToWorld = new THREE.Matrix4().makeBasis(east, up, north);

    // 计算圆锥体的方向向量
    const coneDirection = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation)
    ).normalize();

    // 将圆锥体方向向量转换到世界坐标系
    coneDirection.applyMatrix4(localToWorld);

    // 计算旋转四元数
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), coneDirection);

    // 应用旋转
    group.setRotationFromQuaternion(quaternion);

    // 设置组的位置为用户位置
    group.position.copy(apex);

    return group;
}

function updateCone() {
    const azimuth = document.getElementById('cone-azimuth').value * (Math.PI / 180);
    const elevation = document.getElementById('cone-elevation').value * (Math.PI / 180);
    const height = parseFloat(document.getElementById('cone-height').value);
    const angle = document.getElementById('cone-angle').value * (Math.PI / 180);
    
    if (coneMesh) {
        scene.remove(coneMesh);
    }
    
    if (userMarker && userMarker.visible) {
        coneMesh = createCone(userMarker.position, azimuth, elevation, height, angle);
        scene.add(coneMesh);
    } else {
        console.error('用户标记不存在或不可见，无法创建圆锥体');
    }
}

function handleDataPointClick(event) {
    const target = event.target;
    if (target.tagName === 'TD') {
        const row = target.closest('tr');
        if (!row) return;

        // 获取距离、仰角和方位角数据
        const distance = row.cells[5].textContent;
        const elevation = row.cells[7].textContent; // β (度)
        const azimuth = row.cells[9].textContent; // 方位角 (度)

        if (distance && elevation && azimuth) {
            // 填三角锥参数输入框
            document.getElementById('cone-height').value = parseFloat(distance);
            document.getElementById('cone-elevation').value = parseFloat(elevation);
            document.getElementById('cone-azimuth').value = parseFloat(azimuth);

            // 更新三角锥
            updateCone();
            console.log('数据点击处理成功，已更新三角锥参数');
        } else {
            console.error('无法从表格行中提取所需数据');
        }
    }
}

// 使用 DOMContentLoaded 事件来确保 DOM 已经加载完成
document.addEventListener('DOMContentLoaded', initializeEventListeners);

