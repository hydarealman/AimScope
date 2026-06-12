# AimScope 最简启动手册

这份文档只讲怎么把程序跑起来。

不要在这里看环境检查。
不要在这里看报错排查。

每次使用 AimScope，按下面顺序开 3 个窗口。

---

# 第 1 个窗口：启动 AimScope 网页

打开 Windows PowerShell，运行：

```powershell
wsl -e bash -lc "cd /mnt/d/AimScope/TinyWebServer-master && ./server -p 9006 -s 0 -c 1"
```

这个窗口不要关。

---

# 第 2 个窗口：启动 ROS2 rosbridge

打开 WSL，运行：

```bash
bash /mnt/d/AimScope/scripts/ros2/start_ros2_rosbridge.sh
```

这个窗口不要关。

---

# 第 3 个窗口：启动电脑摄像头发布器

打开 Windows PowerShell，先运行：

```powershell
& "C:\Program Files\usbipd-win\usbipd.exe" detach --busid 1-8
```

然后运行：

```powershell
python D:\AimScope\tools\publishers\aimscope_demo_windows_rosbridge_camera.py --camera-index 0
```

这个窗口不要关。

---

# 第 4 步：打开网页

浏览器打开：

```text
http://127.0.0.1:9006/index.html
```

打开后按一次：

```text
Ctrl + F5
```

---

# 第 5 步：连接 ROS2

网页左侧连接区域这样填：

```text
ROS 类型：ROS2
地址：ws://127.0.0.1:9090
```

点击：

```text
连接
```

---

# 第 6 步：看摄像头画面

右侧图像区域选择：

```text
原始
```

这时应该能看到电脑摄像头实时画面。

---

# 关闭程序

关闭顺序随便。

在 3 个终端窗口里分别按：

```text
Ctrl + C
```

然后关闭浏览器页面。
