# AimScope — 自瞄网页调试器

<p align="center">
  <strong>Auto Aim Debugger · 实时 ROS 监控面板 · RoboMaster</strong>
</p>

<p align="center">
  <a href="#概述">概述</a> ·
  <a href="#最简启动">最简启动</a> ·
  <a href="#系统架构">系统架构</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#环境配置">环境配置</a> ·
  <a href="#使用指南">使用指南</a> ·
  <a href="#快捷键">快捷键</a> ·
  <a href="#项目结构">项目结构</a>
</p>

---

## 概述

**AimScope** 是一个基于浏览器的自瞄系统实时调试面板，面向 **RoboMaster** 竞赛场景。它通过 rosbridge WebSocket 连接 ROS 生态，在浏览器中实时可视化 IMU 姿态数据、摄像头画面、瞄准角度和调试 Topic —— 所有数据在一个网页里呈现，观看端不需要安装任何 ROS 环境。

### 核心特点

- **零安装前端** — 浏览器打开即用，连上 rosbridge 就能看到数据
- **ROS1 / ROS2 双支持** — 一个面板同时支持两种 ROS 版本，自动适配消息类型
- **Windows + WSL 混合运行** — Windows 读摄像头，WSL 跑 ROS，通过本地 WebSocket 通信
- **录制与回放** — 保存 `.aimscope.json` 录制文件，支持逐帧回放、标记、报告导出
- **暗色 / 亮色主题** — 按 `T` 一键切换

---

## 最简启动

> **前提**：WSL2 已安装 ROS2 Humble + rosbridge，Windows 已安装 Python 3 + opencv-python。

按顺序打开 **3 个终端**：

### 第 1 个窗口：启动网页服务（PowerShell）

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

AimScope 网页服务运行在 **9006 端口**，这个窗口不要关。

### 第 2 个窗口：启动 ROS2 rosbridge（WSL）

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

rosbridge WebSocket 服务运行在 **9090 端口**，这个窗口不要关。

### 第 3 个窗口：启动摄像头发布器（PowerShell）

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

读取 Windows 默认摄像头，发布图像和演示数据到 rosbridge。这个窗口不要关。

### 打开网页

```
http://127.0.0.1:9006/index.html
```

按 `Ctrl + F5` 强制刷新，然后：

1. **ROS 类型** 选 `ROS2`
2. **地址** 填 `ws://127.0.0.1:9090`
3. 点击 **连接**

右侧应该能看到实时摄像头画面，中间图表区域有曲线在滚动，Topic 状态面板有数据更新。

> 📖 **更详细的启动步骤**，请看 [`docs/AimScope最简启动手册.md`](docs/AimScope最简启动手册.md)。

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        Windows（宿主机）                           │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐  │
│  │  浏览器               │   │  Python：摄像头发布器              │  │
│  │  Vue 3 单页应用       │   │  aimscope_demo_windows_           │  │
│  │  + roslib.js         │   │  rosbridge_camera.py             │  │
│  │  + Three.js（3D）    │   │  ↑ OpenCV 读摄像头                 │  │
│  │  + Canvas 图表       │   │  ↓ websocket-client 发布数据       │  │
│  └──────┬───────────────┘   └──────────────┬───────────────────┘  │
│         │ HTTP :9006                       │ WebSocket :9090       │
│         │                                  │                       │
│  ┌──────┴──────────────────────────────────┴───────────────────┐  │
│  │                     WSL2（Ubuntu）                            │  │
│  │  ┌──────────────────┐  ┌────────────────────────────────┐   │  │
│  │  │ TinyWebServer     │  │ ROS2 rosbridge                 │   │  │
│  │  │ C++ HTTP 服务端   │  │ ros-humble-rosbridge-suite     │   │  │
│  │  │ 提供静态文件       │  │ ROS Topic ↔ WebSocket 中继     │   │  │
│  │  │ 监听 :9006        │  │ 监听 :9090                     │   │  │
│  │  └──────────────────┘  └────────┬───────────────────────┘   │  │
│  │                                 │ ROS Topic                   │  │
│  │                          ┌──────┴────────┐                  │  │
│  │                          │ ROS2 Demo 节点 │                  │  │
│  │                          │（可选）         │                  │  │
│  │                          └───────────────┘                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 数据流向

```
摄像头 / ROS 节点 → rosbridge（WSL :9090）→ roslib.js（浏览器）→ Vue 3 响应式状态 → Canvas / 图表 / 3D
```

### 监控的 ROS Topic

| Topic | 类型（ROS2） | 说明 |
|---|---|---|
| `/hikrobot_camera/rgb/compressed` | `sensor_msgs/msg/CompressedImage` | 原始摄像头画面 |
| `/tracker/result_image/compressed` | `sensor_msgs/msg/CompressedImage` | 算法结果叠加画面 |
| `/auto_angle` | `geometry_msgs/msg/Vector3` | 瞄准角度指令（X/Y/Z） |
| `/aimscope_demo/serial` | `std_msgs/msg/Float64MultiArray` | IMU + 射击状态数据 |
| `/RmSerialData` | `rm_msgs/msg/RmSerial` | 旧 ROS1 串口数据格式 |
| `/debugpub`、`/debugpub1`、`/debugpub2` | `std_msgs/msg/Float64` | 调试浮点值 |

---

## 功能特性

### 📷 实时摄像头画面
- 两个同步 Canvas：**原始画面** 和 **重投影**（算法结果叠加）
- JPEG 图片通过 rosbridge Base64 传输，浏览器端解码渲染
- 每个画面独立显示 FPS 和延迟
- Windows 原生读取摄像头，WebSocket 发布 —— 不需要 WSL USB 直通

### 📊 可交互时序图表
- **IMU 姿态**（Roll / Pitch / Yaw）—— 红、绿、蓝三色曲线
- **瞄准角度**（X / Y / Z）—— 黄色曲线
- **Debug 数据** —— 橙色曲线
- 交互功能：滚轮缩放、拖拽平移、双击复位、Y 轴锁定、时间窗口可调
- 回放模式下显示同步播放游标

### 🎯 3D 云台可视化
- Three.js 场景，包含云台模型和目标球体
- 鼠标拖拽旋转、滚轮缩放
- 云台朝向由实时 IMU 数据驱动
- 目标位置由瞄准角度指令驱动

### 📡 Topic 状态面板
- 所有订阅 Topic 的实时健康监控
- 每个 Topic 显示：**频率**、**延迟**、**存活时间**（距上次消息）、**消息大小**、**状态**（正常 / 警告 / 报警）
- 状态指示灯：绿色 → 黄色 → 红色
- 点击任意 Topic 可查看完整 JSON 内容

### ⚡ 事件日志与报警
- 去重的事件日志（错误 / 警告 / 信息）
- 报警计数与摘要显示
- 支持一键清空

### 🔴 录制
- 将所有收到的 ROS Topic 数据录制为 `.aimscope.json` 文件
- 可选 **包含图像** 或仅录制数值数据
- 3 分钟后自动停止
- 通过 File System Access API 选择保存目录

### ▶️ 回放
- 加载 `.aimscope.json` 录制文件进行离线复盘
- **回放工具栏**：播放 / 暂停、逐帧步进、速度控制（0.25× / 0.5× / 1× / 2× / 4×）
- **时间轴** 拖动定位
- **标记**：在回放中给关键时刻打标记
- **导出片段**：导出当前位置前后 5 秒的小录制文件
- **导出报告**：自动生成 Markdown 测试报告，包含：
  - 平均 FPS · 最大延迟 · 断流次数
  - 报警次数 · 目标丢失次数 · 开火次数

### 🎨 界面
- **暗色 / 亮色主题** 一键切换
- **可拖拽面板**：侧边栏、图像区、图表区、诊断区之间均可拖拽调整大小
- **键盘快捷键** 覆盖常用操作

---

## 环境配置

### 环境要求

| 组件 | 要求 |
|---|---|
| **操作系统** | Windows 10/11 + WSL2 |
| **WSL ROS** | ROS2 Humble（推荐）或 ROS1 Noetic |
| **Python（Windows）** | Python 3.8+，安装 `opencv-python`、`numpy`、`websocket-client` |
| **浏览器** | 主流现代浏览器（推荐 Chrome / Edge） |
| **Web 服务器** | TinyWebServer（在 WSL 中编译） |

### 配置步骤

详细说明见 [`docs/AimScope环境配置文档.md`](docs/AimScope环境配置文档.md)。简要步骤：

#### 1. Windows Python 依赖

```powershell
python -m pip install opencv-python numpy websocket-client
```

三个包的作用：
- `opencv-python`：读取电脑摄像头
- `numpy`：处理图像数组
- `websocket-client`：连接 rosbridge

#### 2. WSL 安装 ROS2 rosbridge

```bash
sudo apt update
sudo apt install -y ros-humble-rosbridge-suite
```

或使用项目脚本：
```bash
bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh
```

#### 3. 编译 TinyWebServer

```bash
sudo apt install -y build-essential make g++ libmysqlclient-dev
cd /mnt/d/AimScope/TinyWebServer-master
make
```

编译完成后生成 `server` 可执行文件。

---

## 使用指南

### 连接

1. 打开 `http://127.0.0.1:9006/index.html`
2. 左侧连接区域选择 **ROS1** 或 **ROS2**
3. 填入 rosbridge WebSocket 地址（默认 `ws://127.0.0.1:9090`）
4. 点击 **连接**

底部状态栏显示「已连接」即成功。

### 录制

1. 确保已连接 rosbridge 且有数据在更新
2. 可先点击 **选择保存目录** 指定录制文件存放位置
3. 勾选 **含图像** 决定是否包含摄像头帧（不含图像的录制文件更小）
4. 点击 **● 录制** 开始
5. 点击 **■ 停止** 或等待 3 分钟自动停止
6. `.aimscope.json` 文件保存到指定目录

### 回放

1. 点击 **加载录制**，选择一个 `.aimscope.json` 文件
2. 底部出现回放工具栏：
   - **播放 / 暂停** — 开始或暂停回放
   - **上一帧 / 下一帧** — 逐帧查看问题
   - **时间轴滑块** — 拖拽定位到任意时刻
   - **速度按钮** — 0.25× 到 4× 回放速度
   - **-5s / +5s** — 前后跳跃 5 秒
3. **标记** — 在当前时间点打一个问题标记
4. **导出片段** — 导出当前时间前后 5 秒的小录制文件
5. **导出报告** — 导出本次录制的 Markdown 测试报告
6. 点击 **退出** 退出回放模式

### 运行演示数据（无需真实机器人）

如果没有真实机器人数据，可以运行 ROS2 demo 让面板动起来：

```bash
# 在 WSL 中运行（确保 rosbridge 已启动）
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh
```

这会发布正弦波瞄准角度、随机 IMU 数据、摄像头画面（如有摄像头）或模拟动画（无摄像头时）。

---

## 快捷键

| 按键 | 功能 |
|---|---|
| `R` | 开始 / 停止录制 |
| `Space` | 播放 / 暂停回放 |
| `←` / `→` | 后退 / 前进 5 秒 |
| `1` | 切换到原始画面 |
| `2` | 切换到重投影画面 |
| `3` | 切换到 3D 可视化 |
| `T` | 切换暗色 / 亮色主题 |
| `Escape` | 退出回放模式 |

---

## 录制文件格式

`.aimscope.json` 文件采用扁平时间序列结构：

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
      { "t": 0, "d": { /* topic 数据 */ } },
      { "t": 50, "d": { /* ... */ } }
    ]
  },
  "events": [ /* 事件日志 */ ],
  "markers": [ /* 用户标记 */ ],
  "report": { /* 自动生成的报告 */ }
}
```

- `t`：相对录制开始时间的毫秒偏移
- `d`：Topic 消息的完整 JSON 数据
- 所有时间戳统一使用相对时间，便于回放定位

---

## 扩展接口

AimScope 通过 `AimScope.hooks` 提供扩展点（详见 [`assets/js/core/namespace.js`](TinyWebServer-master/root/assets/js/core/namespace.js)）：

```javascript
// 给某个 Topic 注册专用显示格式
AimScope.registerTopicFormatter('/my_topic', function(data) {
  return { title: '自定义标题', body: JSON.stringify(data, null, 2) };
});

// 注册事件日志输出目标（如 IndexedDB、远程日志）
AimScope.registerLogSink(function(entry) {
  console.log('[自定义]', entry.level, entry.message);
});

// 注册自定义面板（预留后续扩展）
AimScope.registerPanel('my-panel', {
  mount: function(container) { /* 渲染 */ },
  unmount: function() { /* 清理 */ }
});
```

---

## 技术栈

| 层级 | 技术 |
|---|---|
| **前端** | Vue 3（CDN 引入，无构建步骤）、Canvas API、WebSocket |
| **ROS 桥接** | roslib.js（浏览器 ↔ rosbridge） |
| **3D** | Three.js（懒加载） |
| **Web 服务器** | TinyWebServer — C++17、epoll、线程池 |
| **数据源** | Python 3、OpenCV、NumPy |
| **ROS** | ROS2 Humble / ROS1 Noetic、rosbridge_suite |
| **基础设施** | WSL2、usbipd-win、Bash、PowerShell |
| **构建** | GNU Make、g++ |

### 为什么不用打包器？

前端刻意保持 **原生 Vue 3 单页应用** 的形式 —— 不用 Webpack、Vite、npm。Vue 和 Three.js 直接放在 `vendor/` 目录下本地引用。这样做的好处：改完 `app.js` 刷新浏览器即可看到效果，零构建链路，零 `node_modules`，零转译。

---

## 文档索引

项目文档均在 [`docs/`](docs/) 目录下：

| 文档 | 内容 |
|---|---|
| [最简启动手册](docs/AimScope最简启动手册.md) | 日常启动看这个 —— 只有命令，不啰嗦 |
| [使用手册](docs/AimScope使用手册.md) | ROS1/ROS2 启动、录制回放、常见错误排查 |
| [环境配置文档](docs/AimScope环境配置文档.md) | 换电脑、重装环境、缺依赖时看这个 |
| [项目结构说明](docs/AimScope项目结构说明.md) | 每个文件负责什么、前端加载顺序、扩展接口 |

---

## 常见问题

### 网页连不上

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 9090
```

如果 `TcpTestSucceeded : False`，说明 rosbridge 没启动，回到 WSL 终端检查报错。

### 网页能连上但没数据

检查左侧 ROS 类型是否选对 —— ROS1 项目选 ROS1，ROS2 项目选 ROS2。消息类型写法不同，选错会导致订阅失败。

### 有数据但没有摄像头画面

1. 先 `Ctrl + F5` 强制刷新网页
2. 确认摄像头发布器在运行
3. 如果摄像头之前挂到了 WSL，先释放回 Windows：
   ```powershell
   & "C:\Program Files\usbipd-win\usbipd.exe" detach --busid 1-8
   ```

### 端口被占用

如果启动 TinyWebServer 时报 `Assertion 'ret >= 0' failed`，说明 9006 端口被旧进程占用：

```powershell
wsl -e bash -lc "pkill -f './server -p 9006'"
```

然后重新启动即可。

---

## 版本

**v2.4** — ROS Bridge

### 更新记录

- **v2.4** — 优化目录结构，清理 TinyWebServer 旧示例页面
- **v2.3** — 重构 ROS1/ROS2 连接，新增 Windows 摄像头发布器，Topic 状态监控，图像 FPS/延迟显示，事件日志报警，录制回放逐帧复盘，问题标记，片段导出，测试报告导出
- **v2.2** — 修复图像传输 bug
- **v2.1** — 界面优化，添加 rqt 风格曲线图，添加图像录制功能
- **v2.0** — AimScope Dashboard v2.0
- **v1.0** — 首个自瞄网页调试器版本

---

## 许可证

本项目面向 RoboMaster 竞赛使用。TinyWebServer 组件基于 [qinguoyi/TinyWebServer](https://github.com/qinguoyi/TinyWebServer)。
