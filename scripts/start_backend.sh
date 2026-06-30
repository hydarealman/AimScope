#!/bin/bash
# AimScope v3.0 — Spring Boot Backend Startup Script
# Run inside WSL (Ubuntu 22.04)

set -e

BACKEND_DIR="/mnt/d/AimScope/backend"
CONFIG_DIR="/mnt/d/AimScope/configs"

echo "=== AimScope Backend Startup ==="
echo ""

# 1. Check Java
if ! command -v java &> /dev/null; then
  echo "[ERROR] Java 11+ is required. Install: sudo apt-get install openjdk-11-jdk"
  exit 1
fi
echo "[OK] Java: $(java -version 2>&1 | head -1)"

# 2. Start MariaDB (if available)
if command -v mariadbd &> /dev/null || command -v mysqld &> /dev/null; then
  echo "[INFO] Starting MariaDB..."
  sudo service mariadb start 2>/dev/null || sudo service mysql start 2>/dev/null || echo "  (already running or manual start needed)"
  # Create database if not exists
  sudo mariadb -e "CREATE DATABASE IF NOT EXISTS aimscope CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
  sudo mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'aimscope'; FLUSH PRIVILEGES;" 2>/dev/null || true
  echo "[OK] MariaDB ready"
else
  echo "[WARN] MariaDB not installed. Install: sudo apt-get install -y mariadb-server"
  echo "       Then: sudo mariadb -e \"CREATE DATABASE aimscope; ALTER USER 'root'@'localhost' IDENTIFIED BY 'aimscope';\""
fi

# 3. Start Redis (if available)
if command -v redis-server &> /dev/null; then
  sudo service redis-server start 2>/dev/null || echo "  (already running)"
  echo "[OK] Redis ready"
else
  echo "[WARN] Redis not installed. Install: sudo apt-get install -y redis-server"
fi

# 4. Start InfluxDB (if available)
if command -v influxd &> /dev/null; then
  sudo service influxdb start 2>/dev/null || echo "  (already running)"
  # First-time setup (only if not already configured)
  if ! influx auth list --skip-verify 2>/dev/null | grep -q aimscope; then
    echo "[INFO] Setting up InfluxDB for first use..."
    influx setup \
      --username admin \
      --password AimScope2024! \
      --org aimscope \
      --bucket aimscope \
      --token aimscope-influx-token-dev-2024 \
      --force 2>/dev/null || echo "  (InfluxDB already configured)"
  fi
  echo "[OK] InfluxDB ready"
else
  echo "[WARN] InfluxDB not installed."
  echo "       Install: curl -sL https://repos.influxdata.com/influxdata-archive_compat.key | sudo gpg --dearmor -o /usr/share/keyrings/influxdb-archive-keyring.gpg"
  echo "                echo 'deb [signed-by=/usr/share/keyrings/influxdb-archive-keyring.gpg] https://repos.influxdata.com/ubuntu jammy stable' | sudo tee /etc/apt/sources.list.d/influxdb.list"
  echo "                sudo apt-get update && sudo apt-get install -y influxdb2"
fi

# 5. Initialize Git repo for configs (if not already)
if [ ! -d "$CONFIG_DIR/.git" ]; then
  cd "$CONFIG_DIR"
  git init
  git config user.name "aimscope"
  git config user.email "aimscope@localhost"
  touch .gitkeep
  git add .gitkeep
  git commit -m "Initial config repository"
  echo "[OK] Git repo initialized in configs/"
fi

echo ""
echo "=== Starting Spring Boot ==="
cd "$BACKEND_DIR"
mvn spring-boot:run
