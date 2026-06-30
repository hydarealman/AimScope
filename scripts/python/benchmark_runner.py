#!/usr/bin/env python3
"""
Benchmark Runner — Compare algorithm parameters by running against a rosbag dataset.
Outputs comparison metrics as JSON.

Usage:
  python3 benchmark_runner.py --replay-file data.bag --config-a ekf_v1.yaml --config-b ekf_v2.yaml
  python3 benchmark_runner.py --replay-file recording.json --config-a pid_tuned.yaml
"""
import argparse
import json
import os
import sys
import random
import yaml


def parse_args():
    p = argparse.ArgumentParser(description='Run benchmark comparison between parameter sets')
    p.add_argument('--replay-file', required=True)
    p.add_argument('--config-a', default='')
    p.add_argument('--config-b', default='')
    p.add_argument('--output-json', required=True)
    return p.parse_args()


def load_config(path: str) -> dict:
    """Load YAML/JSON config file."""
    if not path or not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        if path.endswith('.json'):
            return json.load(f)
        else:
            return yaml.safe_load(f) or {}


def load_replay_data(path: str) -> dict:
    """Load replay data file (JSON or rosbag)."""
    if path.endswith('.json') or path.endswith('.aimscope.json'):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        # For rosbag files, call converter first
        return {'format': 'rosbag', 'path': path, 'topics': {}}


def compute_metrics(replay_data: dict, config: dict) -> dict:
    """
    Compute algorithm metrics by running config against replay data.

    In a real implementation, this would:
    1. Launch the actual C++/Python algorithm with the given config
    2. Feed rosbag frames as input
    3. Measure detection rate, latency, error, etc.

    For this demo, we generate deterministic mock metrics based on config values.
    """
    # Extract key parameters from config
    ekf_cov = config.get('ekf', {}).get('process_noise_covariance', 0.1)
    pid_p = config.get('pid', {}).get('p', 1.0)
    pid_i = config.get('pid', {}).get('i', 0.01)
    pid_d = config.get('pid', {}).get('d', 0.001)
    detection_threshold = config.get('detection', {}).get('confidence_threshold', 0.7)
    camera_exposure = config.get('camera', {}).get('exposure_ms', 10)

    # Deterministic mock computation
    # Better parameters → better metrics
    detection_rate = min(0.99, detection_threshold * 0.5 + 0.45
                         + 0.02 * (1.0 / max(ekf_cov, 0.01))
                         + 0.01 * (camera_exposure / 10.0))
    reprojection_error = max(0.5, 8.0 * ekf_cov + 0.5 * abs(pid_p - 1.5))
    avg_latency_ms = max(5, 30.0 * ekf_cov + 5.0 * abs(pid_d - 0.001) * 1000)
    tracking_stability = max(0.0, 1.0 - 0.3 * abs(pid_p - 1.5) - 0.2 * abs(pid_i - 0.01) * 100)

    # Count messages in replay
    total_frames = 0
    for topic_msgs in replay_data.get('topics', {}).values():
        total_frames = max(total_frames, len(topic_msgs))

    return {
        'detection_rate': round(detection_rate, 4),
        'reprojection_error_px': round(reprojection_error, 2),
        'avg_latency_ms': round(avg_latency_ms, 2),
        'tracking_stability': round(tracking_stability, 4),
        'total_frames_evaluated': total_frames,
        'fps': round(30.0 / max(ekf_cov * 10, 0.5), 1),
        'cpu_usage_percent': round(15.0 + 30.0 * ekf_cov, 1),
        'memory_mb': round(80.0 + 200.0 * ekf_cov, 1),
    }


def generate_report(result: dict) -> str:
    """Generate Markdown comparison report."""
    lines = [
        "# Benchmark Report",
        "",
        "## Summary",
        f"- Total frames: {result.get('metrics_a', {}).get('total_frames_evaluated', 'N/A')}",
        f"- Config A: {result.get('config_a_name', 'N/A')}",
        f"- Config B: {result.get('config_b_name', 'N/A')}",
        "",
        "## Comparison",
        "",
        "| Metric | Config A | Config B | Δ | Winner |",
        "|--------|----------|----------|---|--------|",
    ]

    metrics_a = result.get('metrics_a', {})
    metrics_b = result.get('metrics_b', {})
    config_a_name = result.get('config_a_name', 'A')
    config_b_name = result.get('config_b_name', 'B')

    better_is_lower = {'reprojection_error_px', 'avg_latency_ms', 'cpu_usage_percent', 'memory_mb'}
    better_is_higher = {'detection_rate', 'tracking_stability', 'fps'}

    for key in sorted(set(list(metrics_a.keys()) + list(metrics_b.keys()))):
        if key == 'total_frames_evaluated':
            continue
        va = metrics_a.get(key, 'N/A')
        vb = metrics_b.get(key, 'N/A')
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            if isinstance(va, float):
                va_str = f"{va:.4f}" if va < 1 else f"{va:.2f}"
                vb_str = f"{vb:.4f}" if vb < 1 else f"{vb:.2f}"
            else:
                va_str = str(va)
                vb_str = str(vb)
            delta = f"{vb - va:+.2f}"
            if key in better_is_lower:
                winner = config_a_name if va < vb else config_b_name if vb < va else "Tie"
            elif key in better_is_higher:
                winner = config_a_name if va > vb else config_b_name if vb > va else "Tie"
            else:
                winner = "-"
            lines.append(f"| {key} | {va_str} | {vb_str} | {delta} | {winner} |")
        else:
            lines.append(f"| {key} | {va} | {vb} | - | - |")

    lines.extend([
        "",
        "## Conclusion",
        "",
        "*Detailed conclusion requires human review or additional metrics analysis.*",
        "",
        f"Generated by AimScope Benchmark Runner v3.0",
    ])

    return "\n".join(lines)


def main():
    args = parse_args()
    print(f"[benchmark_runner] Starting...")

    # Load data
    replay_data = load_replay_data(args.replay_file)
    config_a = load_config(args.config_a)
    config_b = load_config(args.config_b)

    # Compute metrics
    result = {
        'config_a_name': os.path.basename(args.config_a) or 'No Config',
        'config_b_name': os.path.basename(args.config_b) or 'No Config',
        'replay_file': os.path.basename(args.replay_file),
    }

    if config_a:
        result['metrics_a'] = compute_metrics(replay_data, config_a)
        print(f"  Config A metrics: {json.dumps(result['metrics_a'], indent=2)}")

    if config_b:
        result['metrics_b'] = compute_metrics(replay_data, config_b)
        print(f"  Config B metrics: {json.dumps(result['metrics_b'], indent=2)}")

    # Generate report
    result['report'] = generate_report(result)

    # Save
    os.makedirs(os.path.dirname(args.output_json) or '.', exist_ok=True)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"  Results saved to {args.output_json}")
    print(f"[benchmark_runner] Done.")


if __name__ == '__main__':
    main()
