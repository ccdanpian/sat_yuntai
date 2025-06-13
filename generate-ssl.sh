#!/bin/bash

# Ubuntu/Linux SSL证书生成脚本

set -e  # 遇到错误立即退出

echo "正在为Ubuntu/Linux系统生成SSL证书..."

# 检查OpenSSL是否安装
if ! command -v openssl &> /dev/null; then
    echo "错误: 未找到OpenSSL，请先安装:"
    echo "sudo apt update && sudo apt install openssl"
    exit 1
fi

# 创建SSL证书目录
echo "创建SSL证书目录..."
mkdir -p ssl

# 生成私钥
echo "生成私钥..."
openssl genrsa -out ssl/server.key 2048

# 生成证书签名请求
echo "生成证书签名请求..."
openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=SatelliteTracker/OU=IT/CN=localhost"

# 生成自签名证书（有效期1年）
echo "生成自签名证书..."
openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt

# 设置权限
echo "设置文件权限..."
chmod 600 ssl/server.key
chmod 644 ssl/server.crt

# 清理临时文件
rm ssl/server.csr

echo "✅ SSL证书生成完成！"
echo "📁 证书文件: ssl/server.crt"
echo "🔑 私钥文件: ssl/server.key"
echo "⚠️  注意: 这是自签名证书，浏览器会显示安全警告，请手动信任该证书。"
echo "🚀 现在可以运行: docker-compose up -d"
