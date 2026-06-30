#!/bin/bash
# AimScope — TinyWebServer Startup
# Serves static files from TinyWebServer-master/root/ on port 9006

TWS_DIR="/mnt/d/AimScope/TinyWebServer-master"

echo "=== AimScope TinyWebServer ==="

# Check if compiled binary exists
if [ -f "$TWS_DIR/server" ]; then
  echo "[INFO] Starting TinyWebServer on port 9006..."
  cd "$TWS_DIR"
  ./server -p 9006 -s 0
elif [ -f "$TWS_DIR/build/server" ]; then
  echo "[INFO] Starting TinyWebServer (from build/) on port 9006..."
  cd "$TWS_DIR/build"
  ./server -p 9006 -s 0
else
  echo "[INFO] Compiling TinyWebServer..."
  cd "$TWS_DIR"
  make server 2>/dev/null || g++ -std=c++14 -O2 -o server \
    webserver.cpp http/http_conn.cpp \
    -lpthread -I. \
    && echo "[OK] Compiled successfully"

  if [ -f "$TWS_DIR/server" ]; then
    echo "[INFO] Starting on port 9006..."
    ./server -p 9006 -s 0
  else
    echo "[ERROR] Failed to build TinyWebServer"
    echo "  Alternatives: use Python HTTP server:"
    echo "    cd $TWS_DIR/root && python3 -m http.server 9006"
    exit 1
  fi
fi
