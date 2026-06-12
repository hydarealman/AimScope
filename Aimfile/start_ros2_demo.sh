#!/usr/bin/env bash
set -e

source /opt/ros/humble/setup.bash
python3 /mnt/d/AimScope/demo/aimscope_demo_ros2.py "$@"
