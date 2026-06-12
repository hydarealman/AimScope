#!/usr/bin/env bash
set -e

ROS_DISTRO_NAME="${ROS_DISTRO:-humble}"

if ! command -v apt >/dev/null 2>&1; then
  echo "当前系统没有 apt，无法自动安装 rosbridge。"
  exit 1
fi

echo "准备安装 ros-${ROS_DISTRO_NAME}-rosbridge-suite"
sudo apt update
sudo apt install -y "ros-${ROS_DISTRO_NAME}-rosbridge-suite"

echo "rosbridge 安装完成。"
