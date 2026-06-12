#!/usr/bin/env bash
set -e

source /opt/ros/humble/setup.bash

if ! ros2 pkg prefix rosbridge_server >/dev/null 2>&1; then
  echo "没有找到 rosbridge_server。请先运行："
  echo "bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh"
  exit 1
fi

ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
