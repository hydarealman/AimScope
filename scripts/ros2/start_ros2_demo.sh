#!/usr/bin/env bash
set -e

source /opt/ros/humble/setup.bash
python3 /mnt/d/AimScope/tools/publishers/aimscope_demo_ros2.py "$@"
