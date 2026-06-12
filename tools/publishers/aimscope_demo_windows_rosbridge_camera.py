#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import base64
import json
import math
import random
import sys
import time

import cv2
import numpy as np
import websocket


ROS2_TYPES = {
    "angle": "geometry_msgs/msg/Vector3",
    "serial": "std_msgs/msg/Float64MultiArray",
    "debug": "std_msgs/msg/Float64",
    "image": "sensor_msgs/msg/CompressedImage",
}

ROS1_TYPES = {
    "angle": "geometry_msgs/Vector3",
    "serial": "std_msgs/Float64MultiArray",
    "debug": "std_msgs/Float64",
    "image": "sensor_msgs/CompressedImage",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Publish the Windows default camera to AimScope through rosbridge."
    )
    parser.add_argument("--url", default="ws://127.0.0.1:9090", help="rosbridge websocket URL")
    parser.add_argument("--ros-version", choices=["ros1", "ros2"], default="ros2")
    parser.add_argument("--camera-index", type=int, default=0, help="OpenCV camera index")
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--fps", type=float, default=20.0)
    parser.add_argument("--jpeg-quality", type=int, default=75)
    parser.add_argument("--duration", type=float, default=0.0, help="Stop after N seconds. 0 means run forever.")
    parser.add_argument(
        "--backend",
        choices=["dshow", "msmf", "any"],
        default="dshow",
        help="OpenCV camera backend on Windows",
    )
    return parser.parse_args()


def stamp_msg(ros_version):
    now = time.time()
    sec = int(now)
    nsec = int((now - sec) * 1_000_000_000)
    if ros_version == "ros1":
        return {"secs": sec, "nsecs": nsec}
    return {"sec": sec, "nanosec": nsec}


def open_camera(args):
    backend = {
        "dshow": cv2.CAP_DSHOW,
        "msmf": cv2.CAP_MSMF,
        "any": cv2.CAP_ANY,
    }[args.backend]

    cap = cv2.VideoCapture(args.camera_index, backend)
    if not cap.isOpened() and args.backend != "any":
        cap.release()
        cap = cv2.VideoCapture(args.camera_index, cv2.CAP_ANY)

    if not cap.isOpened():
        return None

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_FPS, args.fps)
    return cap


def send_json(ws, payload):
    ws.send(json.dumps(payload, separators=(",", ":")))


def advertise(ws, types):
    topics = [
        ("/auto_angle", types["angle"]),
        ("/aimscope_demo/serial", types["serial"]),
        ("/debugpub", types["debug"]),
        ("/debugpub1", types["debug"]),
        ("/debugpub2", types["debug"]),
        ("/hikrobot_camera/rgb/compressed", types["image"]),
        ("/tracker/result_image/compressed", types["image"]),
    ]
    for topic, msg_type in topics:
        send_json(ws, {"op": "advertise", "topic": topic, "type": msg_type})


def publish(ws, topic, msg):
    send_json(ws, {"op": "publish", "topic": topic, "msg": msg})


def synthetic_frame(width, height, elapsed, shoot_flag):
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:, :] = (35, 38, 48)

    x = int((math.sin(elapsed * 0.9) * 0.35 + 0.5) * width)
    y = int((math.cos(elapsed * 0.7) * 0.3 + 0.5) * height)
    color = (0, 0, 255) if shoot_flag else (255, 180, 40)
    cv2.rectangle(frame, (x - 70, y - 44), (x + 70, y + 44), color, 3)
    cv2.circle(frame, (width // 2, height // 2), 5, (245, 245, 245), -1)
    cv2.line(frame, (width // 2 - 35, height // 2), (width // 2 + 35, height // 2), (120, 220, 255), 2)
    cv2.line(frame, (width // 2, height // 2 - 35), (width // 2, height // 2 + 35), (120, 220, 255), 2)
    cv2.putText(frame, "synthetic fallback", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 220, 255), 2)
    return frame


def camera_frame(cap, args, elapsed, shoot_flag):
    if cap is None:
        return synthetic_frame(args.width, args.height, elapsed, shoot_flag), False

    ok, frame = cap.read()
    if not ok or frame is None:
        return synthetic_frame(args.width, args.height, elapsed, shoot_flag), False

    frame = cv2.resize(frame, (args.width, args.height))
    cv2.putText(frame, "windows camera", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (40, 255, 90), 2)
    return frame, True


def compressed_image(frame, args):
    ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, args.jpeg_quality])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return {
        "header": {
            "stamp": stamp_msg(args.ros_version),
            "frame_id": "windows_camera",
        },
        "format": "jpeg",
        "data": base64.b64encode(jpg.tobytes()).decode("ascii"),
    }


def result_frame(frame, angle_x, angle_y):
    result = frame.copy()
    height, width = result.shape[:2]
    center = (width // 2 + int(angle_x * 180), height // 2 - int(angle_y * 180))
    cv2.circle(result, center, 36, (0, 0, 255), 3)
    cv2.line(result, (width // 2, height // 2), center, (0, 255, 255), 3)
    cv2.putText(result, "result", (16, 74), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    return result


def run():
    args = parse_args()
    types = ROS2_TYPES if args.ros_version == "ros2" else ROS1_TYPES

    print(f"Connecting rosbridge: {args.url}")
    ws = websocket.create_connection(args.url, timeout=5)
    advertise(ws, types)
    print("rosbridge connected")

    cap = open_camera(args)
    if cap is None:
        print("WARNING: cannot open camera, publishing synthetic fallback frames")
    else:
        print(f"camera opened: index={args.camera_index}, backend={args.backend}")

    period = 1.0 / max(args.fps, 1.0)
    start = time.time()
    frame_count = 0
    last_report = start

    try:
        while True:
            now = time.time()
            elapsed = now - start
            if args.duration > 0 and elapsed >= args.duration:
                break
            angle_x = 0.5 * math.sin(elapsed * 0.5)
            angle_y = 0.3 * math.cos(elapsed * 0.3)
            roll = 0.2 * math.sin(elapsed * 1.3)
            pitch = 0.1 * math.cos(elapsed * 1.7)
            yaw = math.sin(elapsed * 0.7) * math.pi
            camp = int((elapsed // 3) % 2)
            shoot_flag = 1 if math.sin(elapsed * 4.0) > 0.85 else 0
            bullet_vec = 22.0 + 5.0 * math.sin(elapsed * 0.4)

            frame, real_camera = camera_frame(cap, args, elapsed, shoot_flag)
            result = result_frame(frame, angle_x, angle_y)

            publish(ws, "/auto_angle", {"x": angle_x, "y": angle_y, "z": 0.0})
            publish(
                ws,
                "/aimscope_demo/serial",
                {
                    "layout": {"dim": [], "data_offset": 0},
                    "data": [roll, pitch, yaw, float(camp), float(shoot_flag), bullet_vec],
                },
            )
            publish(ws, "/debugpub", {"data": random.uniform(-10, 10)})
            publish(ws, "/debugpub1", {"data": random.uniform(0, 5)})
            publish(ws, "/debugpub2", {"data": random.uniform(-1, 1)})
            publish(ws, "/hikrobot_camera/rgb/compressed", compressed_image(frame, args))
            publish(ws, "/tracker/result_image/compressed", compressed_image(result, args))

            frame_count += 1
            if now - last_report >= 2.0:
                source = "camera" if real_camera else "synthetic"
                print(f"published {frame_count} frames, source={source}")
                last_report = now

            delay = period - (time.time() - now)
            if delay > 0:
                time.sleep(delay)
    except KeyboardInterrupt:
        print("stopped")
    finally:
        if cap is not None:
            cap.release()
        ws.close()


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
