# AimScope — 自瞄网页调试器

<p align="center">
  <strong>Auto Aim Debugger · Real-time ROS Monitoring Dashboard · RoboMaster</strong>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#setup">Setup</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#project-structure">Structure</a>
</p>

---

## Overview

**AimScope** is a browser-based real-time debugging dashboard for robotic aiming systems, built for the **RoboMaster** competition. It connects to a ROS (Robot Operating System) ecosystem via a rosbridge WebSocket and provides live visualization of IMU data, camera streams, aiming angles, and debug topics — all in a single web interface without any ROS dependency on the viewer side.

### Key characteristics

- **Zero-install frontend** — open a browser tab, connect to rosbridge, and you're live
- **ROS1 + ROS2 dual support** — one dashboard works with both, auto-detected
- **Windows + WSL hybrid** — camera on Windows, ROS stack in WSL2, communicating over localhost WebSocket
- **Recording & playback** — save `.aimscope.json` recordings, replay frame-by-frame with markers and reports
- **Dark/light theme** — toggle with `T`

---

## Quick Start

> **Prerequisites**: WSL2 with ROS2 Humble + rosbridge installed, Python 3 on Windows with opencv-python.

Open **3 terminals** in this order:

### Terminal 1 — Web Server (PowerShell)

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

Serves the AimScope SPA on **port 9006**.

### Terminal 2 — ROS2 rosbridge (WSL)

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

Starts the rosbridge WebSocket server on **port 9090**.

### Terminal 3 — Camera Publisher (PowerShell)

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

Reads your Windows webcam and publishes frames + demo data to rosbridge.

### Open the Dashboard

```
http://127.0.0.1:9006/index.html
```

Press `Ctrl+F5` for a hard refresh, then:

1. Set **ROS type** to `ROS2`
2. Set **address** to `ws://127.0.0.1:9090`
3. Click **连接** (Connect)

You should see live camera frames, rolling charts, and topic status updates.

> 📖 **For detailed step-by-step instructions**, see [`docs/AimScope最简启动手册.md`](docs/AimScope最简启动手册.md).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Windows (Host)                             │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐  │
│  │  Browser             │   │  Python: Camera Publisher         │  │
│  │  Vue 3 SPA           │   │  aimscope_demo_windows_           │  │
│  │  + roslib.js         │   │  rosbridge_camera.py             │  │
│  │  + Three.js (3D)     │   │  ↑ reads webcam via OpenCV        │  │
│  │  + Canvas charts     │   │  ↓ publishes via websocket-client │  │
│  └──────┬───────────────┘   └──────────────┬───────────────────┘  │
│         │ HTTP :9006                       │ WebSocket :9090       │
│         │                                  │                       │
│  ┌──────┴──────────────────────────────────┴───────────────────┐  │
│  │                     WSL2 (Ubuntu)                            │  │
│  │  ┌──────────────────┐  ┌────────────────────────────────┐   │  │
│  │  │ TinyWebServer     │  │ ROS2 rosbridge                 │   │  │
│  │  │ C++ HTTP server   │  │ (ros-humble-rosbridge-suite)   │   │  │
│  │  │ serves static     │  │ relays ROS topics ↔ WebSocket  │   │  │
│  │  │ files on :9006    │  │ listens on :9090               │   │  │
│  │  └──────────────────┘  └────────┬───────────────────────┘   │  │
│  │                                 │ ROS topics                 │  │
│  │                          ┌──────┴────────┐                  │  │
│  │                          │ ROS2 Demo Node │                  │  │
│  │                          │ (optional)     │                  │  │
│  │                          └───────────────┘                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Data flow

```
Camera / ROS Node → rosbridge (WSL :9090) → roslib.js (Browser) → Vue 3 Reactive State → Canvas / Charts / 3D
```

### ROS topics monitored

| Topic | Type (ROS2) | Description |
|---|---|---|
| `/hikrobot_camera/rgb/compressed` | `sensor_msgs/msg/CompressedImage` | Raw camera frames |
| `/tracker/result_image/compressed` | `sensor_msgs/msg/CompressedImage` | Algorithm result overlay |
| `/auto_angle` | `geometry_msgs/msg/Vector3` | Aiming angle command (X/Y/Z) |
| `/aimscope_demo/serial` | `std_msgs/msg/Float64MultiArray` | IMU + shooting data |
| `/RmSerialData` | `rm_msgs/msg/RmSerial` | Legacy ROS1 serial format |
| `/debugpub`, `/debugpub1`, `/debugpub2` | `std_msgs/msg/Float64` | Debug float values |

---

## Features

### 📷 Real-time Camera Display
- Two synchronized canvases: **Raw** and **Result** (reprojection overlay)
- JPEG decoded from rosbridge Base64 transport
- FPS counter and latency metrics per stream
- Webcam frames captured natively on Windows, published via WebSocket — no WSL USB passthrough issues

### 📊 Interactive Time-Series Charts
- **IMU attitude** (Roll / Pitch / Yaw) — red, green, blue traces
- **Aim angle** (X / Y / Z) — yellow traces
- **Debug values** — orange traces
- Features: zoom (scroll wheel), pan (drag), auto-range, lockable Y-axis, adjustable window
- Playback mode shows a synchronized playhead cursor

### 🎯 3D Gimbal Visualization
- Three.js scene with gimbal model + target sphere
- Orbit controls (mouse drag/wheel)
- Gimbal orientation driven by live IMU data
- Target position driven by angle commands

### 📡 Topic Status Panel
- Real-time health monitoring of all subscribed topics
- Per-topic: **Hz**, **latency**, **age** (time since last message), **message size**, **state** (ok / warn / alarm)
- Color-coded status dots: green → yellow → red
- Click any topic to inspect its full JSON payload

### ⚡ Event Log & Alarms
- Deduplicated event log with error / warn / info levels
- Alarm counter with summary display
- Clear on demand

### 🔴 Recording
- Records all incoming ROS topic data to `.aimscope.json` files
- Configurable: **include images** or not
- Auto-stop after 3 minutes
- Choose save directory via File System Access API

### ▶️ Playback
- Load `.aimscope.json` recordings for offline review
- **Playback toolbar**: play/pause, frame-by-frame stepping, speed control (0.25× / 0.5× / 1× / 2× / 4×)
- **Seek** by time or frame via timeline slider
- **Markers**: tag moments of interest during playback
- **Segment export**: export a 5-second clip around the current position
- **Report export**: auto-generated Markdown report with:
  - Average FPS · Max latency · Dropout count
  - Alarm count · Target loss count · Shot count

### 🎨 UI
- **Dark / light theme** toggle
- **Resizable panels**: drag handles between sidebar, image area, main charts, and diagnostics row
- **Keyboard shortcuts** for common operations

---

## Project Structure

```
AimScope/
├── TinyWebServer-master/       # C++ web server + frontend static files
│   ├── root/                   #   Vue 3 SPA (served as static files)
│   │   ├── index.html          #     Main page — layout, sidebar, panels
│   │   ├── app.js              #     Core logic — ROS, recording, playback, UI
│   │   ├── roslib.min.js       #     Browser ↔ rosbridge WebSocket client
│   │   ├── favicon.ico         #     Browser tab icon
│   │   ├── assets/
│   │   │   ├── css/aimscope.css             # Full stylesheet (dark/light themes)
│   │   │   └── js/
│   │   │       ├── core/namespace.js        # Extension hooks & global namespace
│   │   │       ├── core/ring-buffer.js      # Fixed-length RingBuffer for charts
│   │   │       ├── ui/interactive-chart.js  # Canvas-based zoomable chart
│   │   │       └── ui/panel-resize.js       # Drag-to-resize layout handles
│   │   └── vendor/
│   │       ├── vue.global.prod.js           # Vue 3 production runtime
│   │       └── three.min.js                 # Three.js (lazy-loaded for 3D)
│   ├── server                  #   Compiled binary (make)
│   ├── main.cpp                #   Entry point — CLI args, server init
│   ├── webserver.cpp/.h        #   Core server — epoll, thread pool, timer
│   ├── config.cpp/.h           #   CLI config parser
│   ├── makefile                #   Build rules
│   ├── http/                   #   HTTP request/response handling
│   ├── threadpool/             #   Thread pool
│   ├── timer/                  #   Inactive connection cleanup
│   ├── log/                    #   Logging module
│   ├── lock/                   #   Synchronization primitives
│   └── CGImysql/               #   MySQL pool (not actively used)
│
├── tools/publishers/           # Python data publisher scripts
│   ├── aimscope_demo_windows_rosbridge_camera.py  # Windows camera → rosbridge
│   ├── aimscope_demo_ros2.py                     # ROS2 demo node
│   └── aimscope_demo.py                          # ROS1 demo node (legacy)
│
├── scripts/
│   ├── ros2/
│   │   ├── install_ros2_rosbridge.sh   # Install ros-humble-rosbridge-suite
│   │   ├── start_ros2_rosbridge.sh     # Launch rosbridge on :9090
│   │   └── start_ros2_demo.sh          # Launch ROS2 demo publisher
│   └── windows/
│       ├── attach_camera_to_wsl.ps1    # USB camera → WSL via usbipd
│       └── detach_camera_from_wsl.ps1  # USB camera ← WSL
│
├── docs/                       # Documentation (Chinese)
│   ├── AimScope最简启动手册.md          # Minimal startup guide
│   ├── AimScope使用手册.md              # Full user manual
│   ├── AimScope环境配置文档.md          # Environment setup guide
│   └── AimScope项目结构说明.md          # Project structure reference
│
├── data/                       # Runtime data
│   └── recordings/             #   Saved .aimscope.json recordings
│
├── Aimfile/                    # Windows camera publisher logs
└── .gitignore
```

---

## Setup

### Environment

| Component | Requirement |
|---|---|
| **OS** | Windows 10/11 + WSL2 |
| **WSL ROS** | ROS2 Humble (recommended) or ROS1 Noetic |
| **Python (Windows)** | Python 3.8+ with `opencv-python`, `numpy`, `websocket-client` |
| **Browser** | Any modern browser (Chrome/Edge recommended) |
| **Web Server** | TinyWebServer (compiled from source in WSL) |

### Step-by-step environment setup

Detailed instructions are in [`docs/AimScope环境配置文档.md`](docs/AimScope环境配置文档.md). In short:

#### 1. Windows Python dependencies

```powershell
python -m pip install opencv-python numpy websocket-client
```

#### 2. WSL ROS2 rosbridge

```bash
sudo apt update
sudo apt install -y ros-humble-rosbridge-suite
```

Or use the script:
```bash
bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh
```

#### 3. Compile TinyWebServer

```bash
sudo apt install -y build-essential make g++ libmysqlclient-dev
cd /mnt/d/AimScope/TinyWebServer-master
make
```

---

## Usage

### Connection

1. Open `http://127.0.0.1:9006/index.html`
2. Select **ROS1** or **ROS2** in the sidebar dropdown
3. Enter the rosbridge WebSocket URL (default: `ws://127.0.0.1:9090`)
4. Click **连接** (Connect)

### Recording

1. Ensure you're connected to rosbridge with active data
2. Optionally click **选择保存目录** to pick a save directory
3. Toggle **含图像** to include/exclude camera frames
4. Click **● 录制** to start recording
5. Click **■ 停止** to stop (or wait for auto-stop after 3 minutes)
6. A `.aimscope.json` file is saved to the chosen directory

### Playback

1. Click **加载录制** and select a `.aimscope.json` file
2. Use the playback toolbar at the bottom:
   - **播放/暂停** — start/stop playback
   - **上一帧/下一帧** — frame-by-frame stepping
   - **Timeline slider** — seek to any position
   - **Speed buttons** — 0.25× to 4× playback speed
   - **-5s / +5s** — jump back/forward 5 seconds
3. **标记** — add a marker at the current position
4. **导出片段** — export a 5-second clip around current position
5. **导出报告** — export a Markdown test report
6. Click **退出** to exit playback mode

### Demo Data (no hardware needed)

If you have no real robot data, run the ROS2 demo publisher:

```bash
# In WSL, with rosbridge already running:
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh
```

This generates synthetic sinusoidal aiming data, random IMU/angle values, and camera frames (or a synthetic animation if no camera is available).

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Toggle recording |
| `Space` | Play / pause playback |
| `←` / `→` | Seek back/forward 5 seconds |
| `1` | Switch to raw camera view |
| `2` | Switch to result/reprojection view |
| `3` | Switch to 3D visualization |
| `T` | Toggle dark/light theme |
| `Escape` | Exit playback mode |

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
      { "t": 0, "d": { /* topic data */ } },
      { "t": 50, "d": { /* ... */ } }
    ]
  },
  "events": [ /* event log */ ],
  "markers": [ /* user markers */ ],
  "report": { /* auto-generated report */ }
}
```

---

## Extension Hooks

AimScope provides extension points via `AimScope.hooks` (see [`assets/js/core/namespace.js`](TinyWebServer-master/root/assets/js/core/namespace.js)):

```javascript
// Custom topic display formatter
AimScope.registerTopicFormatter('/my_topic', function(data) {
  return { title: 'My Topic', body: JSON.stringify(data, null, 2) };
});

// Custom log sink (e.g., IndexedDB, remote logging)
AimScope.registerLogSink(function(entry) {
  console.log('[Custom]', entry.level, entry.message);
});

// Custom panel (for future extensibility)
AimScope.registerPanel('my-panel', {
  mount: function(container) { /* render */ },
  unmount: function() { /* cleanup */ }
});
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vue 3 (CDN, no build step), Canvas API, WebSocket |
| **ROS Bridge** | roslib.js (browser ↔ rosbridge) |
| **3D** | Three.js (lazy-loaded) |
| **Web Server** | TinyWebServer — C++17, epoll, thread pool |
| **Data Sources** | Python 3, OpenCV, NumPy |
| **ROS** | ROS2 Humble / ROS1 Noetic, rosbridge_suite |
| **Infrastructure** | WSL2, usbipd-win, Bash, PowerShell |
| **Build** | GNU Make, g++ |

### Why no bundler?

The frontend is intentionally a **vanilla Vue 3 SPA** — no Webpack, Vite, or npm. Vue and Three.js are vendored locally. This keeps the project simple: update `app.js` and refresh the browser. No build pipeline, no node_modules, no transpilation.

---

## Documentation

All documentation is in Chinese, located in [`docs/`](docs/):

| Document | Content |
|---|---|
| [最简启动手册](docs/AimScope最简启动手册.md) | Minimal startup — just the commands to run |
| [使用手册](docs/AimScope使用手册.md) | Full user manual — ROS1/ROS2, recording, playback, FAQ |
| [环境配置文档](docs/AimScope环境配置文档.md) | Environment setup — deps, WSL, rosbridge, compilation |
| [项目结构说明](docs/AimScope项目结构说明.md) | File responsibilities and extension hooks |

---

## Version

**v2.4** — ROS Bridge

### Changelog highlights

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

Modifications to TinyWebServer source files (`webserver.cpp`, `http/http_conn.cpp`, `threadpool/threadpool.h`) are noted in their file headers. Third-party frontend libraries (Vue 3 — MIT, Three.js — MIT, roslib.js — BSD) are used under their respective licenses.
