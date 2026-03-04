#!/bin/bash
# AI4Research 一键启动脚本

echo "=== AI4Research 论文阅读助手 ==="
echo ""

# 启动后端
echo "[1/2] 启动后端服务 (port 8000)..."
cd backend
pip install -r requirements.txt -q
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# 等后端启动
sleep 3

# 启动前端
echo "[2/2] 启动前端服务 (port 3000)..."
cd frontend
npm install
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== 启动完成 ==="
echo "前端: http://localhost:3000"
echo "后端: http://localhost:8000"
echo "API文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
