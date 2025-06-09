FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 使用环境变量设置端口
ENV PORT=5000

# 暴露默认端口
EXPOSE ${PORT}

# 假设你的主程序是 app.py
CMD ["python", "app.py"] 