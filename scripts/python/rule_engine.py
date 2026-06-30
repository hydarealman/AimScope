#!/usr/bin/env python3
"""
Rule Engine — Auto-detect anomalies in robot replay data.
Identifies: vision loss, control overshoot, IMU anomalies, and other events.

Usage:
  python3 rule_engine.py --replay-id 1 --influx-url http://localhost:8086
"""
import argparse
import json
import sys
import os
from typing import List, Dict, Any, Optional

try:
    from influxdb_client import InfluxDBClient
    HAS_INFLUX = True
except ImportError:
    HAS_INFLUX = False


# ── Rule definitions ──

class Rule:
    """Base class for detection rules."""
    def __init__(self, name: str, level: str, category: str):
        self.name = name
        self.level = level  # error, warn, info
        self.category = category

    def analyze(self, topic_name: str, messages: List[Dict]) -> List[Dict]:
        """Return list of detected events: {t, level, type, message}"""
        raise NotImplementedError


class VisionLossRule(Rule):
    """Detect when camera/image topic has gaps > threshold."""
    def __init__(self, gap_threshold_ms: float = 500):
        super().__init__("vision_loss", "error", "Vision")
        self.gap_threshold_ms = gap_threshold_ms

    def analyze(self, topic_name: str, messages: List[Dict]) -> List[Dict]:
        events = []
        for i in range(1, len(messages)):
            dt = messages[i].get('t', 0) - messages[i-1].get('t', 0)
            if dt > self.gap_threshold_ms:
                events.append({
                    't': messages[i].get('t', 0),
                    'level': self.level,
                    'type': self.name,
                    'message': f"Vision gap {dt:.0f}ms on {topic_name} (threshold: {self.gap_threshold_ms}ms)"
                })
        return events


class OvershootRule(Rule):
    """Detect control overshoot on angle/vector topics."""
    def __init__(self, max_value: float = 180.0, consecutive_frames: int = 3):
        super().__init__("overshoot", "warn", "Control")
        self.max_value = max_value
        self.consecutive = consecutive_frames

    def analyze(self, topic_name: str, messages: List[Dict]) -> List[Dict]:
        events = []
        streak = 0
        for msg in messages:
            d = msg.get('d', {})
            # Check all numeric fields
            exceeded = False
            for key, val in d.items():
                if isinstance(val, (int, float)) and abs(val) > self.max_value:
                    exceeded = True
                    break
            if exceeded:
                streak += 1
            else:
                streak = 0
            if streak >= self.consecutive:
                events.append({
                    't': msg.get('t', 0),
                    'level': self.level,
                    'type': self.name,
                    'message': f"Overshoot on {topic_name}: value > {self.max_value} for {streak} frames"
                })
                streak = 0  # Reset after reporting
        return events


class IMUAnomalyRule(Rule):
    """Detect sudden jumps in IMU data (roll/pitch/yaw)."""
    def __init__(self, jump_threshold_deg: float = 30.0):
        super().__init__("imu_anomaly", "error", "IMU")
        self.jump_threshold = jump_threshold_deg

    def analyze(self, topic_name: str, messages: List[Dict]) -> List[Dict]:
        events = []
        for i in range(1, len(messages)):
            prev = messages[i-1].get('d', {})
            curr = messages[i].get('d', {})
            for key in ['roll', 'pitch', 'yaw', 'Roll', 'Pitch', 'Yaw']:
                pv = prev.get(key, 0)
                cv = curr.get(key, 0)
                if isinstance(pv, (int, float)) and isinstance(cv, (int, float)):
                    if abs(cv - pv) > self.jump_threshold:
                        events.append({
                            't': messages[i].get('t', 0),
                            'level': self.level,
                            'type': self.name,
                            'message': f"IMU {key} jump: {pv:.1f}→{cv:.1f}° on {topic_name}"
                        })
        return events


class DataDropoutRule(Rule):
    """Detect topic dropout (no messages for a period)."""
    def __init__(self, dropout_threshold_ms: float = 1000):
        super().__init__("data_dropout", "error", "DataFlow")
        self.dropout_threshold = dropout_threshold_ms

    def analyze(self, topic_name: str, messages: List[Dict]) -> List[Dict]:
        events = []
        if not messages:
            return events
        for i in range(1, len(messages)):
            dt = messages[i].get('t', 0) - messages[i-1].get('t', 0)
            if dt > self.dropout_threshold:
                events.append({
                    't': messages[i].get('t', 0),
                    'level': self.level,
                    'type': self.name,
                    'message': f"Topic {topic_name} dropout: {dt:.0f}ms gap (threshold: {self.dropout_threshold_ms}ms)"
                })
        return events


# ── Rule registry ──

IMAGE_TOPIC_PATTERNS = ['/hikrobot_camera/', '/image_debug/', '/tracker/result_image', '/camera/']
IMU_TOPIC_PATTERNS = ['/RmSerialData', '/aimscope_demo/serial', '/imu/']
ANGLE_TOPIC_PATTERNS = ['/auto_angle', '/angle/', '/cmd/']
DEBUG_TOPIC_PATTERNS = ['/debugpub']

RULES = {
    'image': [VisionLossRule(gap_threshold_ms=500)],
    'imu': [IMUAnomalyRule(jump_threshold_deg=30.0)],
    'angle': [OvershootRule(max_value=180.0, consecutive_frames=3)],
    'all': [DataDropoutRule(dropout_threshold_ms=1000)],
}


def classify_topic(topic_name: str) -> str:
    """Map topic name to rule category."""
    for pat in IMAGE_TOPIC_PATTERNS:
        if pat in topic_name:
            return 'image'
    for pat in IMU_TOPIC_PATTERNS:
        if pat in topic_name:
            return 'imu'
    for pat in ANGLE_TOPIC_PATTERNS:
        if pat in topic_name:
            return 'angle'
    return 'all'


def run_analysis(topics: Dict[str, List[Dict]]) -> List[Dict]:
    """Run all rules on all topics, return sorted events."""
    all_events = []

    for topic_name, messages in topics.items():
        if not messages:
            continue
        category = classify_topic(topic_name)

        # Apply category-specific rules
        for rule in RULES.get(category, []):
            try:
                events = rule.analyze(topic_name, messages)
                all_events.extend(events)
            except Exception as e:
                print(f"  [WARN] Rule {rule.name} failed on {topic_name}: {e}", file=sys.stderr)

        # Apply universal rules
        for rule in RULES.get('all', []):
            try:
                events = rule.analyze(topic_name, messages)
                all_events.extend(events)
            except Exception as e:
                print(f"  [WARN] Rule {rule.name} failed on {topic_name}: {e}", file=sys.stderr)

    # Sort by time, deduplicate
    all_events.sort(key=lambda e: e['t'])
    return all_events


def main():
    p = argparse.ArgumentParser(description='Analyze replay data for anomalies')
    p.add_argument('--input', required=True, help='Parsed JSON file path')
    p.add_argument('--output', required=True, help='Output events JSON file')
    p.add_argument('--replay-id', type=int, default=0)
    args = p.parse_args()

    print(f"[rule_engine] Analyzing: {args.input}")

    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)

    topics = data.get('topics', {})
    print(f"  Topics: {len(topics)}")

    events = run_analysis(topics)

    print(f"  Detectd {len(events)} events:")
    error_count = sum(1 for e in events if e['level'] == 'error')
    warn_count = sum(1 for e in events if e['level'] == 'warn')
    info_count = sum(1 for e in events if e['level'] == 'info')
    print(f"    Errors: {error_count}, Warnings: {warn_count}, Info: {info_count}")

    # Save result
    result = {
        'replayId': args.replay_id,
        'totalEvents': len(events),
        'summary': {'error': error_count, 'warn': warn_count, 'info': info_count},
        'events': events
    }

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"  Saved to {args.output}")
    print(f"[rule_engine] Done.")


if __name__ == '__main__':
    main()
