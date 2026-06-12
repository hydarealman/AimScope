#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import math
import random

import cv2
import numpy as np
import rclpy
from geometry_msgs.msg import Vector3
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage
from std_msgs.msg import Float64, Float64MultiArray


class AimScopeDemoRos2(Node):
    def __init__(self, args):
        super().__init__("aimscope_demo_ros2")
        self.args = args
        self.cap = None
        self.use_camera = False

        self.pub_angle = self.create_publisher(Vector3, "/auto_angle", 10)
        self.pub_serial = self.create_publisher(Float64MultiArray, "/aimscope_demo/serial", 10)
        self.pub_dbg0 = self.create_publisher(Float64, "/debugpub", 10)
        self.pub_dbg1 = self.create_publisher(Float64, "/debugpub1", 10)
        self.pub_dbg2 = self.create_publisher(Float64, "/debugpub2", 10)
        self.pub_raw_img = self.create_publisher(CompressedImage, "/hikrobot_camera/rgb/compressed", 10)
        self.pub_result_img = self.create_publisher(CompressedImage, "/tracker/result_image/compressed", 10)

        self.open_camera()
        self.timer = self.create_timer(0.05, self.publish_all)
        self.get_logger().info("AimScope ROS2 demo started. Topics publish at 20 Hz.")

    def open_camera(self):
        if self.args.no_camera:
            self.get_logger().warn("Camera disabled by --no-camera. Using synthetic frames.")
            return

        self.cap = cv2.VideoCapture(self.args.camera_index)
        if not self.cap.isOpened():
            self.get_logger().warn(
                f"Cannot open camera index {self.args.camera_index}. "
                "Using synthetic frames. In WSL, check whether /dev/video0 exists."
            )
            self.cap.release()
            self.cap = None
            return

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.args.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.args.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.args.fps)
        self.use_camera = True
        self.get_logger().info(f"Camera opened: index={self.args.camera_index}")

    def destroy_node(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        super().destroy_node()

    def publish_all(self):
        now = self.get_clock().now().nanoseconds / 1e9

        angle = Vector3()
        angle.x = 0.5 * math.sin(now * 0.5)
        angle.y = 0.3 * math.cos(now * 0.3)
        angle.z = 0.0
        self.pub_angle.publish(angle)

        roll = 0.2 * math.sin(now * 1.3)
        pitch = 0.1 * math.cos(now * 1.7)
        yaw = math.sin(now * 0.7) * math.pi
        camp = int((now // 3) % 2)
        shoot_flag = 1 if math.sin(now * 4.0) > 0.85 else 0
        bullet_vec = 22.0 + 5.0 * math.sin(now * 0.4)

        serial = Float64MultiArray()
        serial.data = [roll, pitch, yaw, float(camp), float(shoot_flag), bullet_vec]
        self.pub_serial.publish(serial)

        self.pub_dbg0.publish(Float64(data=random.uniform(-10, 10)))
        self.pub_dbg1.publish(Float64(data=random.uniform(0, 5)))
        self.pub_dbg2.publish(Float64(data=random.uniform(-1, 1)))

        frame = self.read_frame(now, roll, pitch, yaw, shoot_flag)
        raw_msg = self.to_compressed_image(frame)
        self.pub_raw_img.publish(raw_msg)

        result = frame.copy()
        h, w = result.shape[:2]
        center = (w // 2 + int(angle.x * 120), h // 2 - int(angle.y * 120))
        cv2.circle(result, center, 28, (0, 0, 255), 2)
        cv2.line(result, (w // 2, h // 2), center, (0, 255, 255), 2)
        cv2.putText(result, "result", (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        self.pub_result_img.publish(self.to_compressed_image(result))

    def read_frame(self, now, roll, pitch, yaw, shoot_flag):
        if self.use_camera and self.cap is not None:
            ok, frame = self.cap.read()
            if ok and frame is not None:
                frame = cv2.resize(frame, (self.args.width, self.args.height))
                cv2.putText(frame, "camera", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 80), 2)
                return frame

            self.get_logger().warn("Camera read failed. Falling back to synthetic frames.")
            self.use_camera = False

        return self.make_frame(now, roll, pitch, yaw, shoot_flag)

    def make_frame(self, now, roll, pitch, yaw, shoot_flag):
        h, w = 240, 320
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:, :] = (30, 34, 46)

        x = int((math.sin(now * 0.8) * 0.35 + 0.5) * w)
        y = int((math.cos(now * 0.6) * 0.3 + 0.5) * h)
        color = (0, 0, 255) if shoot_flag else (255, 180, 40)
        cv2.rectangle(frame, (x - 35, y - 22), (x + 35, y + 22), color, 2)
        cv2.circle(frame, (w // 2, h // 2), 4, (255, 255, 255), -1)
        cv2.line(frame, (w // 2 - 18, h // 2), (w // 2 + 18, h // 2), (120, 220, 255), 1)
        cv2.line(frame, (w // 2, h // 2 - 18), (w // 2, h // 2 + 18), (120, 220, 255), 1)
        cv2.putText(frame, f"R {roll:+.3f}", (10, h - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)
        cv2.putText(frame, f"P {pitch:+.3f}", (10, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)
        cv2.putText(frame, f"Y {yaw:+.3f}", (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)
        return frame

    def to_compressed_image(self, frame):
        ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.args.jpeg_quality])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        msg = CompressedImage()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.format = "jpeg"
        msg.data = jpg.tobytes()
        return msg


def parse_args():
    parser = argparse.ArgumentParser(description="ROS2 demo data source for AimScope.")
    parser.add_argument("--camera-index", type=int, default=0, help="OpenCV camera index. Default: 0")
    parser.add_argument("--width", type=int, default=320, help="Published image width. Default: 320")
    parser.add_argument("--height", type=int, default=240, help="Published image height. Default: 240")
    parser.add_argument("--fps", type=int, default=20, help="Requested camera FPS. Default: 20")
    parser.add_argument("--jpeg-quality", type=int, default=70, help="JPEG quality 1-100. Default: 70")
    parser.add_argument("--no-camera", action="store_true", help="Do not open camera; publish synthetic frames.")
    return parser.parse_args()


def main():
    args = parse_args()
    rclpy.init()
    node = AimScopeDemoRos2(args)
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    except Exception as exc:
        if "context is invalid" not in str(exc):
            raise
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
