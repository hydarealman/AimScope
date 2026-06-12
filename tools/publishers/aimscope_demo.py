#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import rospy
import random
import math
import cv2
from geometry_msgs.msg import Vector3
from std_msgs.msg import Float64
from sensor_msgs.msg import CompressedImage
import rm_msgs.msg
import numpy as np

class AimScopeDemo:
    def __init__(self):
        # 创建多个ROS节点
        # 节点名aimscope_demo,anonymous=True允许同时运行多个实例
        rospy.init_node('aimscope_demo', anonymous=True)

        # 创建发布者
        # 发送期望的云台角度
        self.pub_angle       = rospy.Publisher('/auto_angle', Vector3, queue_size=10)
        # 模拟电控系统返回的传感器数据
        self.pub_serial      = rospy.Publisher('/RmSerialData', rm_msgs.msg.RmSerial, queue_size=10)
        # 3个debug调试数据
        self.pub_dbg0        = rospy.Publisher('/debugpub', Float64, queue_size=10)
        self.pub_dbg1        = rospy.Publisher('/debugpub1', Float64, queue_size=10)
        self.pub_dbg2        = rospy.Publisher('/debugpub2', Float64, queue_size=10)
        # 模拟原始相机图像
        self.pub_raw_img     = rospy.Publisher('/hikrobot_camera/rgb/compressed', CompressedImage, queue_size=10)
        # 模拟算法处理后的图像
        self.pub_result_img  = rospy.Publisher('/tracker/result_image/compressed', CompressedImage, queue_size=10)


        # 打开摄像头
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            rospy.logerr("无法打开摄像头！将发布黑色图像。")
            self.use_camera = False
        else:
            rospy.loginfo("摄像头已打开。")
            self.use_camera = True

        # 启动定时器并注册清理函数
        self.timer = rospy.Timer(rospy.Duration(0.05), self.publish_all)
        rospy.loginfo("AimScope Demo started (20 Hz).")
        rospy.on_shutdown(self.cleanup) # 注册清理函数

    def cleanup(self):
        if hasattr(self, 'cap') and self.cap.isOpened():
            self.cap.release()
        cv2.destroyAllWindows()

    # 定时回调函数publish_all(event)
    # 该函数每50ms执行一次,完成所有数据发布和图像处理
    def publish_all(self, event):
        t = rospy.Time.now().to_sec()

        # 1. 角度
        # 使用当前时间t生成正弦/余弦值，模拟连续变化的云台角度指令
        angle = Vector3()
        angle.x = 0.5 * math.sin(t * 0.5)
        angle.y = 0.3 * math.cos(t * 0.3)
        self.pub_angle.publish(angle)

        # 2. 发布模拟电控数据（/RmSerialData）
        # 用均匀分布的随机数填充各字段,模拟真实电控板发来的传感器数据
        serial = rm_msgs.msg.RmSerial()
        serial.header.stamp = rospy.Time.now()
        serial.Roll  = random.uniform(-0.2, 0.2)
        serial.Pitch = random.uniform(-0.1, 0.1)
        serial.Yaw   = random.uniform(-3.14, 3.14)
        serial.AngularVelocity_X = random.uniform(-0.5, 0.5)
        serial.AngularVelocity_Y = random.uniform(-0.5, 0.5)
        serial.AngularVelocity_Z = random.uniform(-0.5, 0.5)
        serial.LinearAcceleration_X = random.uniform(-0.1, 0.1)
        serial.LinearAcceleration_Y = random.uniform(-0.1, 0.1)
        serial.LinearAcceleration_Z = random.uniform(9.6, 9.9)
        serial.Camp = random.randint(0, 1)
        serial.ShootFlag = random.randint(0, 1)
        serial.BulletVec = random.uniform(15.0, 30.0)
        self.pub_serial.publish(serial)

        # 3. Debug
        # 发布三个调试浮点数,生成不同范围的随机数,可用于调试时观察数值变化
        self.pub_dbg0.publish(Float64(data=random.uniform(-10, 10)))
        self.pub_dbg1.publish(Float64(data=random.uniform(0, 5)))
        self.pub_dbg2.publish(Float64(data=random.uniform(-1, 1)))

        # 4. 图像获取
        # 成功时：frame 是一个三维 NumPy 数组（H×W×3），BGR 格式，uint8。
        # 失败时：生成一张纯黑图像（480×640），同时每 5 秒打印一次警告。
        # 本地显示：cv2.imshow 在名为 Camera 的窗口中显示图像；cv2.waitKey(1) 刷新窗口并允许按键响应（1 ms 非阻塞）
        if self.use_camera:
            ret, frame = self.cap.read()
            if not ret:
                rospy.logwarn_throttle(5, "摄像头读取失败")
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
            # 本机显示（如果有桌面）
            cv2.imshow('Camera', frame)
            cv2.waitKey(1)
        else:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)


        # 降低分辨率和质量
        frame = cv2.resize(frame,(320,240))
        encode_param = [cv2.IMWRITE_JPEG_QUALITY, 60]
        success,jpg_bytes = cv2.imencode('.jpg',frame,encode_param)
        if not success: 
            rospy.logerr("编码失败")
            return

        # 发布原始图像（注意：转为 list）
        raw_msg = CompressedImage()
        raw_msg.header.stamp = rospy.Time.now()
        raw_msg.format = "jpeg"
        raw_msg.data = list(jpg_bytes)
        # raw_msg.data = jpg_bytes
        self.pub_raw_img.publish(raw_msg)

        # 发布重投影图像
        res_msg = CompressedImage()
        res_msg.header.stamp = rospy.Time.now()
        res_msg.format = "jpeg"
        res_msg.data = list(jpg_bytes)
        # res_msg.data = jpg_bytes
        self.pub_result_img.publish(res_msg)

if __name__ == '__main__':
    demo = AimScopeDemo()
    rospy.spin()
