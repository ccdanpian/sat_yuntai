/**
 * 卫星跟踪应用主入口文件
 * 负责初始化应用
 */

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', function() {
    window.satelliteTracker = new SatelliteTracker();
});
