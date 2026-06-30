# AimScope — 机器人数据闭环平台

<p align="center">
  <strong>Robot Data Closed-Loop Platform · Live Monitor · Data Replay · Parameter Management · Automated Testing</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#v30-后端">v3.0 Backend</a> ·
  <a href="#api-reference">API Reference</a> ·
  <a href="#setup">Setup</a> ·
  <a href="#project-structure">Structure</a>
</p>

---

## Overview

**AimScope** is a browser-based real-time debugging & data management dashboard for robotic aiming systems, built for the **RoboMaster** competition. It connects to ROS via rosbridge WebSocket and provides live visualization — plus an enterprise backend stack for data replay, parameter version control, and automated benchmark testing.

### Key characteristics

- **Zero-install frontend** — open a browser tab, connect, and you're live
- **ROS1 + ROS2 dual support** — one dashboard works with both, auto-detected
- **Windows + WSL hybrid** — camera on Windows, ROS & backend in WSL2
- **v3.0 backend stack** — Spring Boot + MariaDB + InfluxDB + Redis for data persistence and analysis
- **Recording & playback** — `.aimscope.json` recordings with frame-by-frame review
- **Dark/light theme** — toggle with `T`

---

## Quick Start

### Option A: Live Monitor only (v2.x, 3 terminals)

No backend needed — just the real-time ROS dashboard.

> **Prerequisites**: WSL2 with ROS2 Humble + rosbridge, Python 3 on Windows with opencv-python.

```powershell
# Terminal 1 (WSL) — Web Server
cd /mnt/d/AimScope/TinyWebServer-master/root
python3 -m http.server 9006 --bind 0.0.0.0

# Terminal 2 (WSL) — ROS2 rosbridge on :9090
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh

# Terminal 3 (PowerShell) — Windows camera publisher
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

Open `http://127.0.0.1:9006/index.html`, set ROS type to `ROS2`, address to `ws://127.0.0.1:9090`, click **连接**.

### Option B: Full v3.0 stack (5 terminals)

Includes backend for data replay, parameter management, and automated testing.

```bash
# Terminal 1 (WSL) — Install & start databases (first time only)
bash /mnt/d/AimScope/scripts/wsl_install_dbs.sh
# Or manually:
sudo service mariadb start && sudo service redis-server start && sudo service influxdb start

# Terminal 2 (WSL) — Spring Boot backend on :8080
cd /mnt/d/AimScope/backend && mvn spring-boot:run

# Terminal 3 (WSL) — Static file server on :9006
cd /mnt/d/AimScope/TinyWebServer-master/root
python3 -m http.server 9006 --bind 0.0.0.0

# Terminal 4 (WSL) — rosbridge on :9090 (for live ROS data)
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh

# Terminal 5 (PowerShell) — Camera publisher (optional)
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

Open `http://127.0.0.1:9006/index.html`. The v3.0 tabs appear in the top navigation bar.

> **First-time database setup**: After installing databases, run:
> ```bash
> sudo mariadb -e "CREATE DATABASE IF NOT EXISTS aimscope CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
> sudo mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'aimscope'; FLUSH PRIVILEGES;"
> influx setup --username admin --password AimScope2024! --org aimscope --bucket aimscope --token aimscope-influx-token-dev-2024 --force
> ```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Windows (Host)                                  │
│  ┌─────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  Browser             │   │  Python: Camera Publisher             │  │
│  │  Vue 3 SPA           │   │  reads webcam → publishes via WS      │  │
│  │  + roslib.js         │   │                                      │  │
│  │  + Three.js (3D)     │   └──────────────┬───────────────────────┘  │
│  │  + Canvas charts     │                  │                           │
│  └──────┬───────┬───────┘                  │                           │
│         │ :9006 │ :8080                    │ :9090                     │
│         │       │                          │                           │
│  ┌──────┴───────┴──────────────────────────┴───────────────────────┐  │
│  │                     WSL2 (Ubuntu 22.04)                          │  │
│  │  ┌──────────────────┐  ┌────────────────────────────────────┐   │  │
│  │  │ Static Server     │  │ Spring Boot Backend (:8080)         │   │  │
│  │  │ Python HTTP :9006 │  │                                    │   │  │
│  │  │ (or TinyWebServer)│  │  ┌──────────────────────────────┐  │   │  │
│  │  └──────────────────┘  │  │ JWT Auth · REST API            │  │   │  │
│  │                        │  │ WebSocket relay → rosbridge    │  │   │  │
│  │  ┌──────────────────┐  │  │ @Async: rosbag parse, benchmark│  │   │  │
│  │  │ rosbridge (:9090) │  │  └──────────┬───────────────────┘  │   │  │
│  │  │ ROS ↔ WebSocket   │  │             │                      │   │  │
│  │  └────────┬─────────┘  │    ┌─────────┼─────────┐            │   │  │
│  │           │            │    │         │         │            │   │  │
│  │    ┌──────┴──────┐     │ ┌──┴──┐ ┌───┴───┐ ┌──┴──┐        │   │  │
│  │    │ ROS2 Nodes   │     │ │MariaDB│ │InfluxDB│ │Redis │       │   │  │
│  │    │ (optional)   │     │ │users, │ │ROS data│ │session│      │   │  │
│  │    └─────────────┘     │ │params,│ │(ns ts) │ │cache │       │   │  │
│  │                        │ │replays│ │        │ │      │       │   │  │
│  │                        │ └──────┘ └────────┘ └──────┘       │   │  │
│  │                        │                                    │   │  │
│  │                        │  ┌──────────────────────────────┐  │   │  │
│  │                        │  │ Python Tools (subprocess)     │  │   │  │
│  │                        │  │ rosbag_converter.py            │  │   │  │
│  │                        │  │ rule_engine.py                 │  │   │  │
│  │                        │  │ benchmark_runner.py            │  │   │  │
│  │                        │  └──────────────────────────────┘  │   │  │
│  │                        └────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Data flow

```
Live mode:   Camera/ROS → rosbridge :9090 → roslib.js (Browser)
             rosbridge :9090 → Spring Boot WebSocket proxy :8080/ws/ros → Browser

Replay mode: Browser slider → REST API → InfluxDB query → JSON → Canvas charts

Params:      Browser editor → REST API → write file → git commit → version history

Benchmark:   Browser submit → @Async Python runner → metrics JSON → MySQL → report
```

---

## Features

### 📷 Real-time Camera Display
- Two synchronized canvases: **Raw** and **Result** (reprojection overlay)
- JPEG decoded from rosbridge Base64 transport
- FPS counter and latency metrics per stream

### 📊 Interactive Time-Series Charts
- **IMU attitude** (Roll / Pitch / Yaw) — red, green, blue traces
- **Aim angle** (X / Y / Z) — yellow traces
- **Debug values** — orange traces
- Zoom (scroll), pan (drag), auto-range, lockable Y-axis

### 🎯 3D Gimbal Visualization
- Three.js scene with gimbal model + target sphere
- Orbit controls (mouse drag/wheel), driven by live IMU data

### 📡 Topic Status Panel
- Per-topic: **Hz**, **latency**, **age**, **message size**, **state** (ok/warn/alarm)
- Color-coded status dots, click to inspect full JSON payload

### ⚡ Event Log & Alarms
- Deduplicated event log with error/warn/info levels
- Alarm counter with summary display

### 🔴 Recording & ▶️ Playback
- Record all ROS topic data to `.aimscope.json`
- Playback toolbar: play/pause, frame stepping, speed 0.25×–4×
- Timeline slider, markers, 5-second clip export
- Auto-generated Markdown test report

---

## v3.0 Backend

AimScope v3.0 adds a **Java SpringBoot backend** with databases for enterprise-grade robot data management. The v2.x live monitoring dashboard remains functional as the "实时监控" tab.

### Tab Navigation

| Tab | Function | Auth |
|-----|----------|------|
| **实时监控** | Live ROS monitoring (v2.x UI, unchanged) | None |
| **数据回放** | Upload rosbag/JSON, query InfluxDB, timeline replay | TESTER+ |
| **参数管理** | YAML/JSON editor, Git version control, diff view, rollback | TESTER+ |
| **自动化测试** | A/B benchmark runs, comparison reports | ENGINEER |

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | Spring Boot 2.7.18 |
| **Java** | OpenJDK 11 |
| **Database** | MariaDB 10.6 (JPA/Hibernate) |
| **Time-series** | InfluxDB 2.7 |
| **Cache** | Redis 6.0 |
| **Auth** | JWT (io.jsonwebtoken 0.11.5) |
| **Version control** | JGit (org.eclipse.jgit 6.8.0) |
| **Build** | Maven 3.9+ |
| **Python tools** | rosbag converter, rule engine, benchmark runner |

### Data Replay & Analysis

1. **Upload** — rosbag (.bag/.mcap) or AimScope recordings via browser drag-and-drop
2. **Parse** — Python `rosbag_converter.py` writes to InfluxDB (@Async, non-blocking, progress via Redis)
3. **Query** — `GET /api/replay/{id}/data?topic=X&from=0&to=5000` returns millisecond-precise data
4. **Analyze** — Rule engine detects:
   - Vision loss (>500ms gap in tracking results)
   - Overshoot (3+ consecutive frames exceeding threshold)
   - IMU anomaly (30° jump in roll/pitch/yaw)
   - Data dropout (>1s gap in any topic)

### Parameter Management

- **Editor** — In-browser YAML/JSON editor with syntax highlighting, line numbers, Tab/Ctrl+S support
- **Git versioning** — Every save = `git commit` via JGit. Full history, rollback to any version
- **Diff** — LCS-based side-by-side comparison with add/remove highlighting, synchronized scroll
- **Roles** — ENGINEER (read/write), TESTER (read-only for sensitive params)

### Automated Testing (Benchmark)

- **A/B comparison** — Compare two parameter sets against the same rosbag replay
- **Metrics** — detection_rate, reprojection_error, avg_latency_ms, fps, cpu_usage
- **Report** — Auto-generated Markdown comparison table with winner determination

---

## API Reference

### Authentication

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/api/auth/register` | `{username, password, role}` | `{token, role}` | None |
| POST | `/api/auth/login` | `{username, password}` | `{token, role}` | None |
| GET | `/api/auth/me` | — | `{id, username, role}` | JWT |

**Roles**: `TESTER` (default, can view replay/params), `ENGINEER` (full access including benchmark + param editing)

### Parameter Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/params/` | List all configs | TESTER+ |
| POST | `/api/params/` | Create config | ENGINEER |
| GET | `/api/params/{id}` | Get latest version | TESTER+ |
| PUT | `/api/params/{id}` | Update (new git version) | ENGINEER |
| GET | `/api/params/{id}/versions` | Version history | TESTER+ |
| GET | `/api/params/{id}/versions/{vid}` | Get specific version | TESTER+ |
| POST | `/api/params/{id}/rollback/{vid}` | Rollback to version | ENGINEER |
| GET | `/api/params/{id}/diff?v1=&v2=` | Side-by-side diff | TESTER+ |

### Data Replay

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/replay/upload` | Upload rosbag/JSON (multipart) | TESTER+ |
| GET | `/api/replay/sessions` | List replay sessions | TESTER+ |
| GET | `/api/replay/{id}` | Session detail + topic list | TESTER+ |
| GET | `/api/replay/{id}/data?topic=&from=&to=` | Query time-series data | TESTER+ |
| GET | `/api/replay/{id}/events?from=&to=` | Query analysis events | TESTER+ |
| GET | `/api/replay/{id}/progress` | Parse progress | TESTER+ |
| DELETE | `/api/replay/{id}` | Delete session + data | TESTER+ |

### Automated Testing

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/benchmark/` | Create run `{name, replayId, configAId, configBId}` | ENGINEER |
| GET | `/api/benchmark/` | List all runs | TESTER+ |
| GET | `/api/benchmark/{id}` | Run detail + metrics | TESTER+ |
| GET | `/api/benchmark/{id}/report` | Download Markdown report | TESTER+ |

### ROS Proxy

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/ros` | Browser connects here, backend relays to rosbridge :9090 |

---

## Setup

### Environment

| Component | Requirement |
|-----------|-------------|
| **OS** | Windows 10/11 + WSL2 |
| **WSL** | Ubuntu 22.04 |
| **Java** | OpenJDK 11 (for backend) |
| **Databases** | MariaDB 10.6, Redis 6.0, InfluxDB 2.7 |
| **ROS** | ROS2 Humble (recommended) or ROS1 Noetic |
| **Python (Windows)** | 3.8+ with `opencv-python`, `numpy`, `websocket-client` |
| **Browser** | Chrome/Edge (any modern browser) |

### Database Installation (WSL)

```bash
# All-in-one install script:
bash /mnt/d/AimScope/scripts/wsl_install_dbs.sh

# Or step-by-step:
sudo apt-get update
sudo apt-get install -y mariadb-server redis-server

# InfluxDB 2.x (via deb package if GPG key fails)
wget https://dl.influxdata.com/influxdb/releases/influxdb2_2.7.11-1_amd64.deb
sudo dpkg -i influxdb2_2.7.11-1_amd64.deb

# Setup databases
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS aimscope CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'aimscope'; FLUSH PRIVILEGES;"
influx setup --username admin --password AimScope2024! --org aimscope --bucket aimscope --token aimscope-influx-token-dev-2024 --force
```

### ROS2 rosbridge

```bash
sudo apt install -y ros-humble-rosbridge-suite
# Or: bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh
```

### Windows Python

```powershell
python -m pip install opencv-python numpy websocket-client
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Toggle recording |
| `Space` | Play / pause playback |
| `←` / `→` | Seek back/forward 5 seconds |
| `1` | Raw camera view |
| `2` | Result/reprojection view |
| `3` | 3D visualization |
| `T` | Toggle dark/light theme |
| `Escape` | Exit playback mode |

---

## Project Structure

```
AimScope/
│
├── TinyWebServer-master/          # Static file server + frontend
│   ├── root/                      #   Vue 3 SPA root
│   │   ├── index.html             #     Main page — top tabs, panels, modals
│   │   ├── app.js                 #     Core logic — ROS, tabs, auth, replay, params, benchmark
│   │   ├── roslib.min.js          #     Browser ↔ rosbridge WebSocket client
│   │   ├── favicon.ico
│   │   ├── assets/
│   │   │   ├── css/
│   │   │   │   └── aimscope.css   #       Full stylesheet (dark/light themes, tabs, panels)
│   │   │   └── js/
│   │   │       ├── api/           #       REST API clients
│   │   │       │   ├── auth-api.js        # JWT login/register/me
│   │   │       │   ├── param-api.js       # Param CRUD + versions + diff
│   │   │       │   ├── replay-api.js      # Replay upload + query
│   │   │       │   └── benchmark-api.js   # Benchmark create + report
│   │   │       ├── ui/            #       UI components
│   │   │       │   ├── interactive-chart.js # Canvas-based zoomable charts
│   │   │       │   ├── panel-resize.js      # Drag-to-resize handles
│   │   │       │   ├── config-editor.js     # YAML/JSON editor with syntax highlighting
│   │   │       │   └── diff-viewer.js       # LCS-based side-by-side diff
│   │   │       └── core/
│   │   │           ├── namespace.js         # Extension hooks & global namespace
│   │   │           └── ring-buffer.js       # Fixed-length RingBuffer
│   │   └── vendor/
│   │       ├── vue.global.prod.js           # Vue 3 production runtime
│   │       └── three.min.js                 # Three.js (lazy-loaded for 3D)
│   ├── server                      #   Compiled binary
│   ├── webserver.cpp/.h            #   Core — epoll, thread pool, timer
│   ├── http/                       #   HTTP request/response
│   ├── threadpool/                 #   Thread pool
│   └── makefile                    #   Build rules
│
├── backend/                        # Spring Boot backend (v3.0)
│   ├── pom.xml
│   ├── src/main/resources/
│   │   └── application.yml         #   DB, JWT, InfluxDB, storage config
│   └── src/main/java/com/aimscope/
│       ├── AimScopeApplication.java
│       ├── model/entity/           #   JPA entities
│       │   ├── User.java           #     id, username, passwordHash, role
│       │   ├── ParamConfig.java    #     id, name, fileType, currentContent
│       │   ├── ParamVersion.java   #     configId, versionNum, gitCommitHash
│       │   ├── ReplaySession.java  #     filename, fileHash, status, messageCount
│       │   └── BenchmarkRun.java   #     name, replayId, configA/B, metricsJSON
│       ├── repository/             #   Spring Data JPA repositories (×5)
│       ├── security/               #   JWT authentication
│       │   ├── JwtUtil.java        #     Token generation & validation
│       │   └── JwtFilter.java      #     Bearer token filter
│       ├── config/                 #   Spring configuration
│       │   ├── SecurityConfig.java #     CORS, endpoints, JWT filter
│       │   ├── WebConfig.java      #     CORS whitelist
│       │   ├── InfluxDBConfig.java #     InfluxDB client bean
│       │   └── WebSocketConfig.java#     /ws/ros endpoint
│       ├── dto/                    #   Request/Response objects
│       │   ├── LoginRequest.java
│       │   ├── RegisterRequest.java
│       │   ├── ParamUpdateRequest.java
│       │   └── BenchmarkRequest.java
│       ├── service/                #   Business logic
│       │   ├── AuthService.java    #     Register, login, BCrypt
│       │   ├── ParamService.java   #     CRUD + JGit versioning + diff
│       │   ├── ReplayService.java  #     Upload, InfluxDB query, rule engine
│       │   ├── BenchmarkService.java#   @Async Python runner
│       │   └── RosRelayService.java#    WebSocket proxy to rosbridge
│       └── controller/             #   REST controllers
│           ├── AuthController.java
│           ├── ParamController.java
│           ├── ReplayController.java
│           └── BenchmarkController.java
│
├── scripts/
│   ├── ros2/                       # ROS2 scripts
│   │   ├── install_ros2_rosbridge.sh
│   │   ├── start_ros2_rosbridge.sh
│   │   └── start_ros2_demo.sh
│   ├── windows/                    # USB camera attach/detach
│   │   ├── attach_camera_to_wsl.ps1
│   │   └── detach_camera_from_wsl.ps1
│   ├── python/                     # Python backend tools (v3.0)
│   │   ├── rosbag_converter.py     #   Rosbag → InfluxDB parser
│   │   ├── rule_engine.py          #   Anomaly detection rules
│   │   └── benchmark_runner.py     #   A/B config comparison
│   ├── start_backend.sh            # Backend + DB startup
│   ├── start_tinywebserver.sh      # TinyWebServer startup
│   └── wsl_install_dbs.sh          # WSL database install script
│
├── tools/publishers/               # Python data publishers
│   ├── aimscope_demo_windows_rosbridge_camera.py  # Windows camera → rosbridge
│   ├── aimscope_demo_ros2.py                     # ROS2 demo publisher
│   └── aimscope_demo.py                          # ROS1 demo publisher (legacy)
│
├── configs/                        # Git-managed parameter files (v3.0)
│   ├── ekf_params_v1.yaml          #   Sample EKF parameters
│   └── pid_params_v1.yaml          #   Sample PID parameters
│
├── docs/                           # Documentation (Chinese)
│   ├── AimScope最简启动手册.md
│   ├── AimScope使用手册.md
│   ├── AimScope环境配置文档.md
│   └── AimScope项目结构说明.md
│
├── data/recordings/                # Saved .aimscope.json files
├── .gitignore
└── README.md
```

---

## Recording Format

`.aimscope.json` files use a flat time-series format:

```json
{
  "version": "2.2",
  "format": "aimscope-recording",
  "metadata": {
    "startTime": "2026-06-10T02:57:04.577Z",
    "duration": 5.1,
    "includesImages": false,
    "rosUrl": "ws://192.168.186.136:9090",
    "recordedAt": "2026-06-10T02:57:09.678Z"
  },
  "topics": {
    "/topic_name": [
      { "t": 0, "d": {} },
      { "t": 50, "d": {} }
    ]
  },
  "events": [],
  "markers": [],
  "report": {}
}
```

---

## Extension Hooks

AimScope provides extension points via `AimScope.hooks`:

```javascript
// Custom topic display formatter
AimScope.registerTopicFormatter('/my_topic', function(data) {
  return { title: 'My Topic', body: JSON.stringify(data, null, 2) };
});

// Custom log sink
AimScope.registerLogSink(function(entry) {
  console.log('[Custom]', entry.level, entry.message);
});

// Custom panel
AimScope.registerPanel('my-panel', {
  mount: function(container) { /* render */ },
  unmount: function() { /* cleanup */ }
});
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vue 3 (CDN, no build), Canvas API, WebSocket |
| **ROS Bridge** | roslib.js (browser ↔ rosbridge) |
| **3D** | Three.js (lazy-loaded) |
| **Web Server** | TinyWebServer (C++17, epoll) / Python http.server |
| **Backend** | Spring Boot 2.7.18 + Java 11 |
| **Auth** | JWT (io.jsonwebtoken) + BCrypt |
| **Relational DB** | MariaDB 10.6 (JPA/Hibernate) |
| **Time-series DB** | InfluxDB 2.7 |
| **Cache** | Redis 6.0 |
| **Version Control** | JGit 6.8.0 |
| **Build** | Maven 3.9+, GNU Make |
| **Data Sources** | Python 3, OpenCV, NumPy |
| **ROS** | ROS2 Humble / ROS1 Noetic |
| **Infrastructure** | WSL2, Bash, PowerShell |

### Why no frontend bundler?

The frontend is intentionally a **vanilla Vue 3 SPA** — no Webpack, Vite, or npm. Vue and Three.js are vendored locally. Update `app.js` and refresh the browser. No build pipeline, no node_modules.

---

## Version

**v3.0** — Robot Data Closed-Loop Platform

### Changelog

- **v3.0** — Spring Boot backend (30 Java files), MariaDB/InfluxDB/Redis, JWT auth, 4-tab UI (实时监控/数据回放/参数管理/自动化测试), parameter management with Git version control, LCS-based diff viewer, YAML/JSON editor, rosbag upload & InfluxDB time-series replay, Python rule engine for anomaly detection, A/B benchmark comparison with auto-generated reports, WebSocket relay proxy
- **v2.4** — Refined directory structure, cleaned up legacy TinyWebServer demo pages
- **v2.3** — ROS1/ROS2 connection refactor, Windows camera publisher, topic status monitoring, image FPS/latency display, event log & alarms, recording/playback with frame-by-frame review, markers, segment export, test report export
- **v2.2** — Image transfer bug fixes
- **v2.1** — UI optimization, rqt-style plots, image recording
- **v2.0** — Dashboard v2.0
- **v1.0** — Initial auto-aim web debugger

---

## License

AimScope is licensed under the [MIT License](LICENSE).

The TinyWebServer component is based on [qinguoyi/TinyWebServer](https://github.com/qinguoyi/TinyWebServer), licensed under the Apache License, Version 2.0.

Third-party frontend libraries: Vue 3 (MIT), Three.js (MIT), roslib.js (BSD).
