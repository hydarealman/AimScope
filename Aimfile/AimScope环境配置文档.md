# AimScope 环境配置文档

这份文档只讲环境怎么配置。

如果你只是想把程序跑起来，看：

```text
D:\AimScope\Aimfile\AimScope最简启动手册.md
```

---

# 一、推荐运行方式

你现在这台电脑推荐使用这一套：

```text
Windows 读取电脑摄像头
        ↓
Windows Python 发布图像到 rosbridge
        ↓
WSL ROS2 Humble 运行 rosbridge
        ↓
TinyWebServer 提供 AimScope 网页
        ↓
浏览器显示实时画面
```

这样做的原因：

```text
你的 USB 摄像头挂到 WSL 后，WSL 能识别 /dev/video0，
但是实际抓帧不稳定。
所以真实摄像头画面由 Windows 读取更稳。
```

---

# 二、Windows 环境

## 1. 安装 Python

Windows 里需要能运行：

```powershell
python --version
```

你的电脑当前已经有 Python，可以继续用。

## 2. 安装 Python 依赖

打开 Windows PowerShell，运行：

```powershell
python -m pip install opencv-python numpy websocket-client
```

这三个包的用途：

```text
opencv-python：读取电脑摄像头
numpy：处理图像数组
websocket-client：连接 rosbridge
```

## 3. 摄像头不要挂在 WSL 上

如果要用 Windows 发布器读取真实摄像头，摄像头必须留在 Windows。

如果之前把摄像头挂给 WSL 了，用这个命令释放回来：

```powershell
& "C:\Program Files\usbipd-win\usbipd.exe" detach --busid 1-8
```

你的摄像头当前设备是：

```text
USB2.0 HD UVC WebCam
BUSID: 1-8
```

注意：

```text
Windows 发布器读摄像头时，不要 attach 到 WSL。
WSL 直接读摄像头时，才需要 attach 到 WSL。
```

---

# 三、WSL ROS2 环境

你的 WSL 当前是：

```text
ROS2 Humble
```

ROS2 使用 `ros2 launch`，不要使用 `roslaunch`。

## 1. 加载 ROS2 环境

在 WSL 里运行：

```bash
source /opt/ros/humble/setup.bash
```

## 2. 安装 rosbridge

在 WSL 里运行：

```bash
sudo apt update
sudo apt install -y ros-humble-rosbridge-suite
```

也可以运行项目里的脚本：

```bash
bash /mnt/d/AimScope/Aimfile/install_ros2_rosbridge.sh
```

## 3. 安装编译 TinyWebServer 需要的依赖

在 WSL 里运行：

```bash
sudo apt update
sudo apt install -y build-essential make g++ libmysqlclient-dev
```

说明：

```text
AimScope 当前用 TinyWebServer 启动网页。
即使网页静态模式不连接 MySQL，编译时仍然需要 libmysqlclient-dev。
```

## 4. 编译 TinyWebServer

在 WSL 里运行：

```bash
cd /mnt/d/AimScope/TinyWebServer-master
make
```

编译完成后会生成：

```text
/mnt/d/AimScope/TinyWebServer-master/server
```

---

# 四、ROS2 demo 环境

ROS2 demo 文件是：

```text
D:\AimScope\demo\aimscope_demo_ros2.py
```

它用于发布模拟自瞄数据，也可以尝试在 WSL 内读取摄像头。

WSL 里需要这些 Python 包：

```bash
sudo apt install -y python3-opencv python3-numpy
```

不过你当前推荐用 Windows 摄像头发布器，所以日常运行不一定需要启动这个 demo。

---

# 五、Windows 摄像头发布器

发布器文件是：

```text
D:\AimScope\demo\aimscope_demo_windows_rosbridge_camera.py
```

它的作用：

```text
读取 Windows 默认摄像头
发布 /hikrobot_camera/rgb/compressed
发布 /tracker/result_image/compressed
发布 /auto_angle
发布 /aimscope_demo/serial
发布 /debugpub、/debugpub1、/debugpub2
```

默认摄像头编号是：

```text
0
```

启动命令：

```powershell
python D:\AimScope\demo\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

---

# 六、ROS1 可选环境

只有需要运行旧 ROS1 示例时，才配置这一段。

ROS1 Noetic 常用环境加载命令：

```bash
source /opt/ros/noetic/setup.bash
```

安装 ROS1 rosbridge：

```bash
sudo apt update
sudo apt install -y ros-noetic-rosbridge-suite
```

启动 ROS1 rosbridge：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch port:=9090
```

旧 ROS1 demo 是：

```text
D:\AimScope\demo\aimscope_demo.py
```

注意：

```text
这个文件依赖 rospy。
不能用 Windows 普通 Python 直接运行。
必须在 ROS1 环境里运行。
```

---

# 七、文件分工

常用文件如下：

```text
D:\AimScope\TinyWebServer-master\server
AimScope 网页服务程序

D:\AimScope\TinyWebServer-master\root\index.html
AimScope 网页

D:\AimScope\TinyWebServer-master\root\app.js
AimScope 前端逻辑

D:\AimScope\demo\aimscope_demo_windows_rosbridge_camera.py
Windows 摄像头实时发布器

D:\AimScope\demo\aimscope_demo_ros2.py
ROS2 demo 数据发布器

D:\AimScope\demo\aimscope_demo.py
旧 ROS1 demo

D:\AimScope\Aimfile\start_ros2_rosbridge.sh
启动 ROS2 rosbridge

D:\AimScope\Aimfile\install_ros2_rosbridge.sh
安装 ROS2 rosbridge
```

---

# 八、最终环境目标

环境配好后，应该能完成这三件事：

```text
1. WSL 能启动 rosbridge：端口 9090
2. WSL 能启动 TinyWebServer：端口 9006
3. Windows 能读取摄像头并发布到 rosbridge
```

日常使用时，不需要每次重新配置环境。

日常只看：

```text
D:\AimScope\Aimfile\AimScope最简启动手册.md
```
