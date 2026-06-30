#!/bin/bash
# WSL database install script
set -e

echo "=== Updating packages ==="
sudo apt-get update -qq

echo "=== Installing MariaDB ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server
sudo service mariadb start
sudo mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'aimscope'; FLUSH PRIVILEGES;"
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS aimscope CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "MariaDB: OK"

echo "=== Installing Redis ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server
sudo service redis-server start
echo "Redis: OK"

echo "=== Installing InfluxDB 2.x ==="
if ! command -v influxd &> /dev/null; then
  curl -sL https://repos.influxdata.com/influxdata-archive_compat.key | sudo gpg --dearmor -o /usr/share/keyrings/influxdb-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/influxdb-archive-keyring.gpg] https://repos.influxdata.com/ubuntu jammy stable" | sudo tee /etc/apt/sources.list.d/influxdb.list
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq influxdb2
fi
sudo service influxdb start
sleep 2

# Setup InfluxDB
echo "=== Setting up InfluxDB ==="
influx setup \
  --username admin \
  --password AimScope2024! \
  --org aimscope \
  --bucket aimscope \
  --token aimscope-influx-token-dev-2024 \
  --force 2>/dev/null || echo "InfluxDB already set up (or first-time setup skipped)"

echo "=== ALL DONE ==="
echo "MariaDB: root/aimscope, DB: aimscope"
echo "Redis: localhost:6379"
echo "InfluxDB: admin/AimScope2024!, org: aimscope, bucket: aimscope, token: aimscope-influx-token-dev-2024"
