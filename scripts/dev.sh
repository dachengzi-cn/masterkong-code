#!/usr/bin/env bash
# 并行启动前端 (vite) 与后端 (nest)，并统一转发退出信号。
set -e

# 在 macOS / Linux 上并行运行两个 watch 进程
concurrently -n "server,client" -c "blue,green" \
  "npm run dev:server" \
  "npm run dev:client"
