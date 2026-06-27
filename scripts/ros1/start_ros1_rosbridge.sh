#!/bin/bash
# ================================================
#  AimScope ROS1 (Noetic) rosbridge 启动脚本
#  配合 rm_auto_aim_sim 仿真使用
# ================================================
#
# 用法: bash start_ros1_rosbridge.sh
#
# 前提: ROS1 Noetic 环境已 source, rosbridge_server 已安装
#   sudo apt install -y ros-noetic-rosbridge-server
#
# 启动后在浏览器打开: http://127.0.0.1:9006/index.html
#   ROS类型: ROS1
#   地址: ws://127.0.0.1:9090
#

set -e

source /opt/ros/noetic/setup.bash 2>/dev/null || true
source ~/ws_glut_vison_7v7/devel/setup.bash 2>/dev/null || true

echo "=== AimScope ROS1 rosbridge ==="
echo "WebSocket: ws://0.0.0.0:9090"
echo ""

roslaunch rosbridge_server rosbridge_websocket.launch \
  port:=9090 \
  address:=0.0.0.0
