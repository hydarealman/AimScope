#!/usr/bin/env bash
set -e

source /opt/ros/humble/setup.bash

echo "[1/2] apt update"
sudo apt update

echo "[2/2] install rosbridge for ROS2 Humble"
sudo apt install -y ros-humble-rosbridge-suite

echo
echo "安装完成。现在可以运行："
echo "source /opt/ros/humble/setup.bash"
echo "ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090"
