# AimScope 傻瓜式使用手册

现在文档拆成三份：

```text
D:\AimScope\docs\AimScope最简启动手册.md
```

只想把程序跑起来，看这个。

```text
D:\AimScope\docs\AimScope环境配置文档.md
```

重装环境、换电脑、缺依赖时，看这个。

```text
D:\AimScope\docs\AimScope使用手册.md
```

需要理解 ROS1、ROS2、录制、播放、常见错误时，看这个。

```text
D:\AimScope\docs\AimScope项目结构说明.md
```

需要了解项目目录、文件职责、哪些文件是核心文件时，看这个。

---

这份手册分三块：

1. 先启动 AimScope 网页。
2. 如果你是 ROS1，看 ROS1 启动命令。
3. 如果你是 ROS2，看 ROS2 启动命令。

你现在的 WSL 是 ROS2 Humble，所以优先看“ROS2 版本”。

---

# 一、先启动 AimScope 网页

不管你是 ROS1 还是 ROS2，都先启动网页。

## 第 1 步：打开 Windows PowerShell

## 第 2 步：运行 AimScope

复制下面这一整行，粘贴到 PowerShell，按回车：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

如果窗口一直停在那里，不要关。

这代表 AimScope 网页服务正在运行。

## 第 3 步：打开网页

浏览器打开：

```text
http://127.0.0.1:9006/index.html
```

看到 AimScope 页面，就说明网页启动成功。

---

# 二、ROS2 版本启动方法

你的 WSL 当前是 ROS2 Humble，用这一版。

ROS2 不能用 `roslaunch`。

ROS2 不要运行这个：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch port:=9090
```

这是 ROS1 的命令。

## ROS2 第 1 步：打开 WSL 终端

进入 WSL。

## ROS2 第 2 步：加载 ROS2 环境

运行：

```bash
source /opt/ros/humble/setup.bash
```

检查 ROS2 是否可用：

```bash
echo $ROS_DISTRO
```

如果输出：

```text
humble
```

说明 ROS2 环境加载成功。

## ROS2 第 3 步：检查 rosbridge 是否安装

运行：

```bash
ros2 pkg prefix rosbridge_server
```

如果有输出，例如：

```text
/opt/ros/humble
```

说明 rosbridge 已经安装。

如果没有输出，说明 rosbridge 没安装。

安装命令是：

```bash
sudo apt update
sudo apt install -y ros-humble-rosbridge-suite
```

安装时需要输入你的 WSL sudo 密码。

也可以直接运行我给你准备好的安装脚本：

```bash
bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh
```

## ROS2 第 4 步：启动 rosbridge

运行：

```bash
source /opt/ros/humble/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
```

这个窗口不要关。

也可以直接运行我给你准备好的启动脚本：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

## ROS2 第 5 步：网页连接 ROS2

回到 AimScope 网页。

左侧“连接”区域：

ROS 类型选择：

```text
ROS2
```

地址填写：

```text
ws://127.0.0.1:9090
```

然后点击：

```text
连接
```

底部显示：

```text
已连接
```

就成功。

---

# 三、ROS1 版本启动方法

如果你用的是 ROS1，例如 Noetic，用这一版。

ROS1 才使用 `roslaunch`。

## ROS1 第 1 步：打开 ROS1 终端

如果 ROS1 在 WSL 或 Ubuntu 里，先加载 ROS1 环境。

Noetic 常见命令：

```bash
source /opt/ros/noetic/setup.bash
```

检查：

```bash
echo $ROS_DISTRO
```

如果输出：

```text
noetic
```

说明 ROS1 环境加载成功。

## ROS1 第 2 步：检查 rosbridge 是否安装

运行：

```bash
rospack find rosbridge_server
```

如果能输出路径，说明 rosbridge 已安装。

如果提示找不到，安装：

```bash
sudo apt update
sudo apt install -y ros-noetic-rosbridge-suite
```

## ROS1 第 3 步：启动 rosbridge

运行：

```bash
source /opt/ros/noetic/setup.bash
roslaunch rosbridge_server rosbridge_websocket.launch port:=9090
```

这个窗口不要关。

## ROS1 第 4 步：网页连接 ROS1

回到 AimScope 网页。

左侧“连接”区域：

ROS 类型选择：

```text
ROS1
```

地址填写：

```text
ws://127.0.0.1:9090
```

点击：

```text
连接
```

底部显示：

```text
已连接
```

就成功。

---

# 四、你现在这台 WSL 应该怎么做

你现在是 ROS2 Humble。

所以你应该按这个顺序来：

## 第 1 个终端：启动 rosbridge

在 WSL 里运行：

```bash
source /opt/ros/humble/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
```

如果提示找不到 `rosbridge_server`，先运行：

```bash
bash /mnt/d/AimScope/scripts/ros2/install_ros2_rosbridge.sh
```

装完以后，再运行：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

## 第 2 个终端：启动 AimScope 网页

打开 Windows PowerShell，运行：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

## 第 3 步：打开网页

浏览器打开：

```text
http://127.0.0.1:9006/index.html
```

## 第 4 步：网页里这样填

左侧连接区域：

```text
ROS 类型：ROS2
地址：ws://127.0.0.1:9090
```

然后点：

```text
连接
```

---

# 五、录制实时数据

顺序固定：

```text
1. 启动 rosbridge
2. 启动 AimScope 网页
3. 打开网页
4. 选择 ROS1 或 ROS2
5. 填 ws://127.0.0.1:9090
6. 点击连接
7. 点击录制
```

停止录制：

```text
再点一次停止
```

浏览器会保存：

```text
xxx.aimscope.json
```

---

# 六、运行演示数据

如果你现在没有真实机器人数据，可以先运行演示节点，让 AimScope 页面动起来。

## ROS2 演示数据

你现在是 ROS2 Humble，用这个。

不要在 Windows 的 `D:\AimScope\tools\publishers>` 里运行：

```text
python aimscope_demo.py
```

这个是 ROS1 旧 demo，会报：

```text
ModuleNotFoundError: No module named 'rospy'
```

正确做法是在 WSL 里运行 ROS2 demo。

这个 ROS2 demo 会优先读取电脑默认摄像头：

```text
摄像头编号 0
```

如果摄像头读取成功，AimScope 的“原始画面”会显示摄像头画面。

如果摄像头读取失败，它会自动显示模拟画面。

打开一个 WSL 终端，运行：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh
```

这个窗口不要关。

然后确保 rosbridge 也启动了：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

最后打开 AimScope 网页：

```text
http://127.0.0.1:9006/index.html
```

网页左侧选择：

```text
ROS 类型：ROS2
地址：ws://127.0.0.1:9090
```

点击连接。

如果连接成功，你应该能看到曲线、数值和图像都在变化。

如果你有多个摄像头，可以换摄像头编号：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh --camera-index 1
```

如果你暂时不想用摄像头，只想用模拟画面：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh --no-camera
```

注意：如果你在 WSL 里运行 demo，WSL 必须能看到摄像头设备。

检查命令：

```bash
ls /dev/video*
```

如果输出类似：

```text
/dev/video0
```

说明 WSL 能看到摄像头。

如果提示没有这个文件，说明当前 WSL 还不能直接访问 Windows 摄像头。此时 demo 会自动退回模拟画面。

## 推荐办法：Windows 读摄像头，WSL 只跑 rosbridge

如果 WSL 能看到 `/dev/video0`，但是网页还是没有真实摄像头画面，优先用这个办法。

原因很简单：

```text
有些 Windows USB 摄像头挂到 WSL 后，只能被识别，不能稳定吐出视频流。
```

这种情况下，不要让 WSL 读摄像头。

让 Windows 直接读默认摄像头，然后通过 rosbridge 发给 AimScope。

### 第 1 步：启动 rosbridge

在 WSL 里运行：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

这个窗口不要关。

### 第 2 步：启动 Windows 摄像头发布器

打开 Windows PowerShell，运行：

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py
```

如果提示缺 Python 包，先运行：

```powershell
python -m pip install opencv-python numpy websocket-client
```

然后再运行：

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py
```

如果窗口里看到：

```text
rosbridge connected
camera opened
published 41 frames, source=camera
```

说明真实摄像头已经发出去了。

### 第 3 步：网页连接

打开：

```text
http://127.0.0.1:9006/index.html
```

左侧连接区域填：

```text
ROS 类型：ROS2
地址：ws://127.0.0.1:9090
```

点击：

```text
连接
```

这时图像区域应该能看到电脑默认摄像头画面。

### 停止 Windows 摄像头发布器

回到启动它的 PowerShell 窗口，按：

```text
Ctrl + C
```

如果它是在后台运行的，用这个命令停止：

```powershell
Get-CimInstance Win32_Process | Where-Object { ($_.Name -like 'python*') -and ($_.CommandLine -like '*aimscope_demo_windows_rosbridge_camera.py*') } | ForEach-Object { Stop-Process -Id $_.ProcessId }
```

## 把 Windows USB 摄像头挂到 WSL

如果你希望 WSL 里的 ROS2 demo 读取真实摄像头，需要把 USB 摄像头挂载到 WSL。

你的电脑摄像头当前识别为：

```text
USB2.0 HD UVC WebCam
BUSID: 1-8
```

我已经准备好了脚本。

### 第 1 步：右键管理员运行挂载脚本

在 Windows 文件管理器里找到：

```text
D:\AimScope\scripts\windows\attach_camera_to_wsl.ps1
```

右键，选择：

```text
使用 PowerShell 运行
```

如果没有管理员权限，请用管理员 PowerShell 运行：

```powershell
powershell -ExecutionPolicy Bypass -File D:\AimScope\scripts\windows\attach_camera_to_wsl.ps1
```

如果弹出 UAC，点“是”。

### 第 2 步：检查 WSL 是否看到摄像头

在 WSL 里运行：

```bash
ls /dev/video*
```

如果看到：

```text
/dev/video0
```

说明摄像头已经挂到 WSL。

### 第 3 步：启动 ROS2 demo

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh
```

这时 AimScope 的原始画面应该显示真实摄像头画面。

### 释放摄像头回 Windows

如果你想让 Windows 重新使用摄像头，运行：

```powershell
powershell -ExecutionPolicy Bypass -File D:\AimScope\scripts\windows\detach_camera_from_wsl.ps1
```

注意：摄像头挂给 WSL 后，Windows 里的相机软件可能暂时不能同时使用它。

## ROS1 演示数据

只有你安装了 ROS1，并且有 `rospy`、`rm_msgs` 时，才运行旧 demo：

```bash
source /opt/ros/noetic/setup.bash
python3 /mnt/d/AimScope/tools/publishers/aimscope_demo.py
```

如果你用 Windows 的普通 Python 运行它，肯定会缺 `rospy`。

---

# 七、播放录制文件

播放录制文件不需要启动 ROS。

只需要启动 AimScope 网页：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

打开：

```text
http://127.0.0.1:9006/index.html
```

然后点击：

```text
加载录制
```

选择：

```text
.aimscope.json
```

点击播放即可。

## 回放增强功能

加载录制文件后，底部会出现回放工具栏。

常用按钮：

```text
上一帧
下一帧
标记
导出片段
导出报告
```

用途：

```text
上一帧 / 下一帧：按图像帧逐帧查看问题
标记：给当前时间点打一个问题标记
导出片段：导出当前时间前后 5 秒的小录制文件
导出报告：导出本次录制的测试报告
```

右侧“复盘帧”区域会显示：

```text
当前回放时间
当前图像帧编号
最近 Topic
目标数据
标记列表
```

右侧“测试报告”区域会显示：

```text
平均 FPS
最大延迟
断流次数
报警次数
目标丢失次数
开火次数
```

---

# 八、常见错误

## 错误 1：roslaunch not found

你在 ROS2 环境里运行了 ROS1 命令。

ROS2 应该运行：

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
```

不是：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch port:=9090
```

## 错误 2：Package 'rosbridge_server' not found

说明 rosbridge 没装。

ROS2 Humble 安装：

```bash
sudo apt update
sudo apt install -y ros-humble-rosbridge-suite
```

ROS1 Noetic 安装：

```bash
sudo apt update
sudo apt install -y ros-noetic-rosbridge-suite
```

## 错误 3：网页连接不上

先检查 9090 是否打开：

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 9090
```

如果是：

```text
TcpTestSucceeded : False
```

说明 rosbridge 没启动成功。

先回到 rosbridge 那个终端检查报错。

## 错误 4：网页能连接，但是没数据

检查网页左侧 ROS 类型是否选对：

```text
ROS1 项目选 ROS1
ROS2 项目选 ROS2
```

ROS1 和 ROS2 的消息类型写法不同，选错可能导致订阅不到数据。

## 错误 4.1：有数据，但是没有摄像头图片

先按这个顺序检查。

### 第 1 步：刷新网页

浏览器打开：

```text
http://127.0.0.1:9006/index.html
```

按：

```text
Ctrl + F5
```

这样可以强制浏览器重新加载最新的 `app.js`。

### 第 2 步：确认网页左侧这样填

```text
ROS 类型：ROS2
地址：ws://127.0.0.1:9090
```

然后点：

```text
连接
```

### 第 3 步：确认 Windows 摄像头发布器在运行

打开 PowerShell，运行：

```powershell
Get-CimInstance Win32_Process | Where-Object { ($_.Name -like 'python*') -and ($_.CommandLine -like '*aimscope_demo_windows_rosbridge_camera.py*') }
```

如果没有输出，说明摄像头发布器没启动。

运行：

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py
```

看到：

```text
published 41 frames, source=camera
```

说明摄像头正在发布。

### 第 4 步：确认网页服务是新版本

PowerShell 运行：

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:9006/app.js?v=20260612-camera-fix"
```

如果这里报“连接被意外关闭”，说明 TinyWebServer 不是新编译版本。

重新编译并启动：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && make"
wsl -e bash -lc "pkill -f './server -p 9006' || true"
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

## 错误 5：No module named 'rospy'

你运行了 ROS1 demo：

```text
python aimscope_demo.py
```

但是你当前环境不是 ROS1。

如果你是 ROS2，用这个：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_demo.sh
```

如果你一定要运行 `aimscope_demo.py`，那必须安装并进入 ROS1 环境，例如 Noetic：

```bash
source /opt/ros/noetic/setup.bash
python3 /mnt/d/AimScope/tools/publishers/aimscope_demo.py
```

## 错误 6：Assertion `ret >= 0' failed

如果启动 AimScope 时看到：

```text
server: webserver.cpp:137: void WebServer::eventListen(): Assertion `ret >= 0' failed.
```

一般是因为：

```text
9006 端口已经被旧的 AimScope 占用了
```

解决办法 1：不用重新启动，直接打开网页：

```text
http://127.0.0.1:9006/index.html
```

解决办法 2：先停止旧的 AimScope，再重新启动：

```powershell
wsl -e bash -lc "pkill -f './server -p 9006'"
```

然后重新运行：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

解决办法 3：换一个端口，比如 9007：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9007 -s 0 -c 1"
```

然后打开：

```text
http://127.0.0.1:9007/index.html
```
