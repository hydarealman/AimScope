#!/usr/bin/env python3
"""
Rosbag / AimScope JSON → InfluxDB Converter
Converts robot recording data into time-series InfluxDB for millisecond-level query and replay.

Usage:
  python3 rosbag_converter.py --format json --file recording.json --replay-id 1
  python3 rosbag_converter.py --format rosbag --file data.bag --replay-id 2
"""
import argparse
import json
import sys
import os
import time
from datetime import datetime
from typing import Dict, List, Any

# InfluxDB client (optional — writes raw line protocol if not available)
try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
    HAS_INFLUX = True
except ImportError:
    HAS_INFLUX = False
    print("[WARN] influxdb_client not installed. Will use fallback JSON output.", file=sys.stderr)

# Rosbag support (optional)
try:
    import rosbag2_py
    from rclpy.serialization import deserialize_message
    from rosidl_runtime_py.utilities import get_message
    HAS_ROSBAG = True
except ImportError:
    HAS_ROSBAG = False
    print("[WARN] rosbag2_py not available. Only JSON format supported.", file=sys.stderr)


def parse_args():
    p = argparse.ArgumentParser(description='Convert robot data to InfluxDB')
    p.add_argument('--format', choices=['json', 'rosbag'], default='json')
    p.add_argument('--file', required=True, help='Input file path')
    p.add_argument('--replay-id', required=True, type=int)
    p.add_argument('--influx-url', default='http://localhost:8086')
    p.add_argument('--influx-token', default='')
    p.add_argument('--influx-org', default='aimscope')
    p.add_argument('--influx-bucket', default='aimscope')
    return p.parse_args()


def process_json_file(filepath: str, args) -> Dict[str, Any]:
    """Process .aimscope.json recording format."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    topics = data.get('topics', {})
    metadata = data.get('metadata', {})
    start_time_ms = metadata.get('startTime', 0)

    # Convert string ISO timestamp to epoch ms if needed
    if isinstance(start_time_ms, str):
        try:
            start_time_ms = int(datetime.fromisoformat(start_time_ms.replace('Z', '+00:00')).timestamp() * 1000)
        except Exception:
            start_time_ms = 0

    total_messages = 0
    topic_counts = {}

    for topic_name, messages in topics.items():
        topic_counts[topic_name] = len(messages)
        total_messages += len(messages)

    return {
        'topics': topics,
        'topic_counts': topic_counts,
        'total_messages': total_messages,
        'duration_ms': metadata.get('duration', 0),
        'start_time_ms': start_time_ms
    }


def process_rosbag_file(filepath: str, args) -> Dict[str, Any]:
    """Process .bag / .mcap rosbag file using rosbag2_py."""
    if not HAS_ROSBAG:
        raise RuntimeError("rosbag2_py not available. Install with: sudo apt install ros-humble-rosbag2")

    # Create reader
    storage_options = rosbag2_py.StorageOptions(uri=filepath, storage_id='sqlite3')
    converter_options = rosbag2_py.ConverterOptions('', '')

    reader = rosbag2_py.SequentialReader()
    reader.open(storage_options, converter_options)

    topics = {}
    topic_types = {}
    start_time_ns = None
    total_messages = 0

    while reader.has_next():
        topic_name, msg_data, timestamp_ns = reader.read_next()
        if start_time_ns is None:
            start_time_ns = timestamp_ns

        elapsed_ms = (timestamp_ns - start_time_ns) // 1_000_000

        if topic_name not in topics:
            topics[topic_name] = []
            topic_types[topic_name] = str(type(msg_data))

        # Convert binary message to dict (simplified — store as base64 for now)
        import base64
        msg_dict = {
            't': elapsed_ms,
            'd': {'__raw_binary__': True, '__size__': len(msg_data)}
        }
        topics[topic_name].append(msg_dict)
        total_messages += 1

    topic_counts = {k: len(v) for k, v in topics.items()}
    duration_ms = topics[list(topics.keys())[0]][-1]['t'] if topics else 0

    return {
        'topics': topics,
        'topic_counts': topic_counts,
        'total_messages': total_messages,
        'duration_ms': duration_ms,
        'start_time_ms': (start_time_ns or 0) // 1_000_000
    }


def write_to_influxdb(parsed: Dict[str, Any], args):
    """Write parsed topic data to InfluxDB using line protocol."""
    replay_id = args.replay_id
    topics = parsed['topics']
    total_messages = parsed['total_messages']
    wrote = 0

    if HAS_INFLUX and args.influx_token:
        # Use the InfluxDB client library
        client = InfluxDBClient(url=args.influx_url, token=args.influx_token, org=args.influx_org)
        write_api = client.write_api(write_options=SYNCHRONOUS)

        for topic_name, messages in topics.items():
            for msg in messages:
                t_ms = msg.get('t', 0)
                point = Point("topic_messages") \
                    .tag("replay_id", str(replay_id)) \
                    .tag("topic_name", topic_name) \
                    .field("data", json.dumps(msg.get('d', {}))) \
                    .field("msg_size", len(json.dumps(msg.get('d', {})))) \
                    .time(int(t_ms * 1_000_000))  # ms → ns

                write_api.write(bucket=args.influx_bucket, record=point)
                wrote += 1

                if wrote % 1000 == 0:
                    print(f"  Progress: {wrote}/{total_messages} messages ({100*wrote//total_messages}%)")

        client.close()
    else:
        # Fallback: write to JSON file
        out_path = f"./uploads/replays/parsed_{replay_id}.json"
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(parsed, f, ensure_ascii=False)
        print(f"  Fallback: wrote parsed data to {out_path}")

    return wrote


def update_metadata(parsed: Dict[str, Any], args):
    """Write metadata JSON that SpringBoot can read to update ReplaySession."""
    meta = {
        'replayId': args.replay_id,
        'topicCount': len(parsed['topic_counts']),
        'messageCount': parsed['total_messages'],
        'totalDurationMs': parsed['duration_ms'],
        'topics': parsed['topic_counts']
    }
    meta_path = f"./uploads/replays/meta_{args.replay_id}.json"
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f)
    print(f"  Metadata written to {meta_path}")
    return meta


def main():
    args = parse_args()

    print(f"[rosbag_converter] Processing: {args.file}")
    print(f"  Format: {args.format}")
    print(f"  Replay ID: {args.replay_id}")

    if not os.path.exists(args.file):
        print(f"[ERROR] File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    # Parse
    if args.format == 'json':
        parsed = process_json_file(args.file, args)
    else:
        parsed = process_rosbag_file(args.file, args)

    print(f"  Topics: {len(parsed['topic_counts'])}")
    print(f"  Messages: {parsed['total_messages']}")
    print(f"  Duration: {parsed['duration_ms']} ms")

    # Write to InfluxDB
    wrote = write_to_influxdb(parsed, args)
    print(f"  Wrote {wrote} messages to InfluxDB")

    # Write metadata
    meta = update_metadata(parsed, args)

    print(f"[rosbag_converter] Done. {meta['messageCount']} messages across {meta['topicCount']} topics.")


if __name__ == '__main__':
    main()
