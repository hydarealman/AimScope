# AimScope 项目结构说明

这份文档说明当前项目里哪些文件负责什么。

---

# 一、核心目录

```text
D:\AimScope
```

项目根目录。

主要分成三块：

```text
TinyWebServer-master
demo
Aimfile
```

---

# 二、网页和服务端

```text
D:\AimScope\TinyWebServer-master
```

这是 AimScope 网页服务所在目录。

## 1. 网页静态文件

```text
D:\AimScope\TinyWebServer-master\root
```

当前只保留 AimScope 运行需要的文件：

```text
index.html
app.js
roslib.min.js
favicon.ico
vendor\
```

含义：

```text
index.html
AimScope 网页主页面

app.js
AimScope 前端逻辑，负责连接 rosbridge、显示图像、显示姿态和图表

roslib.min.js
浏览器连接 rosbridge 需要的 JS 库

favicon.ico
浏览器标签页图标

vendor\vue.global.prod.js
本地 Vue 运行库

vendor\three.min.js
本地 Three.js 运行库，用于 3D 姿态显示
```

已经删除的旧文件：

```text
log.html
register.html
picture.html
video.html
fans.html
welcome.html
judge.html
各种 gif/jpg/mp4 示例资源
monitor.js
index_old.html
```

这些是 TinyWebServer 原示例页面或早期调试文件，和当前 AimScope 无关。

## 2. TinyWebServer 服务端

常用文件：

```text
main.cpp
webserver.cpp
webserver.h
config.cpp
config.h
makefile
server
```

含义：

```text
server
编译后的网页服务程序

makefile
编译 TinyWebServer 的规则

http\http_conn.cpp
HTTP 请求解析和静态文件返回逻辑

threadpool\
线程池

timer\
定时器

log\
日志模块

CGImysql\
原 TinyWebServer 的 MySQL 模块
```

当前 AimScope 静态网页启动命令：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

---

# 三、Demo 数据源

```text
D:\AimScope\demo
```

## 1. Windows 摄像头发布器

```text
aimscope_demo_windows_rosbridge_camera.py
```

用途：

```text
Windows 读取电脑默认摄像头
通过 rosbridge 发布到 AimScope 网页
```

推荐启动命令：

```powershell
python D:\AimScope\demo\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

## 2. ROS2 demo

```text
aimscope_demo_ros2.py
```

用途：

```text
ROS2 环境下发布 AimScope 演示数据
```

启动脚本：

```bash
bash /mnt/d/AimScope/Aimfile/start_ros2_demo.sh
```

## 3. ROS1 demo

```text
aimscope_demo.py
```

用途：

```text
旧 ROS1 示例
```

注意：

```text
它依赖 rospy，不能用 Windows 普通 Python 直接运行。
```

---

# 四、文档和脚本

```text
D:\AimScope\Aimfile
```

当前主要文档：

```text
AimScope最简启动手册.md
AimScope环境配置文档.md
AimScope使用手册.md
AimScope项目结构说明.md
```

含义：

```text
AimScope最简启动手册.md
日常启动程序时看这个

AimScope环境配置文档.md
换电脑、重装环境、缺依赖时看这个

AimScope使用手册.md
需要了解 ROS1/ROS2、播放录制、常见错误时看这个

AimScope项目结构说明.md
说明项目目录和文件职责
```

当前主要脚本：

```text
install_ros2_rosbridge.sh
start_ros2_rosbridge.sh
start_ros2_demo.sh
attach_camera_to_wsl.ps1
detach_camera_from_wsl.ps1
```

含义：

```text
install_ros2_rosbridge.sh
安装 ROS2 rosbridge

start_ros2_rosbridge.sh
启动 ROS2 rosbridge，端口 9090

start_ros2_demo.sh
启动 ROS2 demo

attach_camera_to_wsl.ps1
把 USB 摄像头挂到 WSL

detach_camera_from_wsl.ps1
把 USB 摄像头从 WSL 释放回 Windows
```

---

# 五、推荐日常启动顺序

日常只需要这三部分：

```text
1. TinyWebServer 网页服务
2. ROS2 rosbridge
3. Windows 摄像头发布器
```

完整命令看：

```text
D:\AimScope\Aimfile\AimScope最简启动手册.md
```
