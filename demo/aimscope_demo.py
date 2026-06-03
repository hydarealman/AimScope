#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import rospy
import random
import math
import os

from geometry_msgs.msg import Vector3
from std_msgs.msg import Float64
from sensor_msgs.msg import CompressedImage
import rm_msgs.msg   # 确保 rm_msgs 已编译

# 如果不想装 opencv，可以改用下面的函数直接读 JPEG 文件
def load_jpeg_bytes(path):
    """ 从文件读取 JPEG 二进制数据，若文件不存在则返回一个最小占位图 """
    if not os.path.exists(path):
        # 生成一个简单的黑色 JPEG 占位图 (1x1 像素)
        rospy.logwarn("Image not found: %s, using placeholder", path)
        return b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xf7\x00\xff\xd9'
    with open(path, 'rb') as f:
        return f.read()

class AimScopeDemo:
    def __init__(self):
        rospy.init_node('aimscope_demo', anonymous=True)

        # ---- 发布器 ----
        self.pub_angle       = rospy.Publisher('/auto_angle', Vector3, queue_size=10)
        self.pub_serial      = rospy.Publisher('/RmSerialData', rm_msgs.msg.RmSerial, queue_size=10)
        self.pub_dbg0        = rospy.Publisher('/debugpub', Float64, queue_size=10)
        self.pub_dbg1        = rospy.Publisher('/debugpub1', Float64, queue_size=10)
        self.pub_dbg2        = rospy.Publisher('/debugpub2', Float64, queue_size=10)
        self.pub_raw_img     = rospy.Publisher('/hikrobot_camera/rgb/compressed', CompressedImage, queue_size=10)
        self.pub_result_img  = rospy.Publisher('/tracker/result_image/compressed', CompressedImage, queue_size=10)

        # 准备测试图片（请将 jpg 文件放到 demo 文件夹下，或使用绝对路径）
        self.raw_jpg = load_jpeg_bytes(os.path.join(os.path.dirname(__file__), 'test_raw.jpg'))
        self.result_jpg = load_jpeg_bytes(os.path.join(os.path.dirname(__file__), 'test_result.jpg'))

        # 定时器，20 Hz
        self.timer = rospy.Timer(rospy.Duration(0.05), self.publish_all)
        rospy.loginfo("AimScope Demo Publisher started. Publishing at 20 Hz.")

    def publish_all(self, event):
        t = rospy.Time.now().to_sec()

        # 1. 视觉→电控角度（动态变化）
        angle = Vector3()
        angle.x = 0.5 * math.sin(t * 0.5)
        angle.y = 0.3 * math.cos(t * 0.3)
        angle.z = 0.0
        self.pub_angle.publish(angle)

        # 2. 电控→自瞄数据（RmSerial）
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
        serial.Camp = random.choice(['r', 'b'])
        serial.ShootFlag = random.choice(['a', 'f'])
        serial.BulletVec = random.uniform(15.0, 30.0)
        self.pub_serial.publish(serial)

        # 3. Debug 数据
        self.pub_dbg0.publish(Float64(data=random.uniform(-10, 10)))
        self.pub_dbg1.publish(Float64(data=random.uniform(0, 5)))
        self.pub_dbg2.publish(Float64(data=random.uniform(-1, 1)))

        # 4. 原始相机图像 (CompressedImage)
        raw_msg = CompressedImage()
        raw_msg.header.stamp = rospy.Time.now()
        raw_msg.format = "jpeg"
        raw_msg.data = self.raw_jpg
        self.pub_raw_img.publish(raw_msg)

        # 5. 重投影图像
        res_msg = CompressedImage()
        res_msg.header.stamp = rospy.Time.now()
        res_msg.format = "jpeg"
        res_msg.data = self.result_jpg
        self.pub_result_img.publish(res_msg)

if __name__ == '__main__':
    demo = AimScopeDemo()
    rospy.spin()