import argparse
import json
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Enqueue a capture pair for upload.")
    parser.add_argument("--raw",          required=True, help="Path to the white-light (raw) JPEG")
    parser.add_argument("--ir",           required=True, help="Path to the IR JPEG")
    parser.add_argument("--session",      required=True, help="Unique session UUID")
    parser.add_argument("--device",       required=True, help="Device ID (e.g. pi-001)")
    parser.add_argument("--captured-at",  required=True, help="ISO 8601 capture timestamp")
    parser.add_argument("--queue",        required=True, help="Path to the upload queue JSON file")
    return parser.parse_args()


def main():
    args = parse_args()

    queue_path = Path(args.queue)
    queue_path.parent.mkdir(parents=True, exist_ok=True)

    items = json.loads(queue_path.read_text()) if queue_path.exists() else []

    items.append({
        "raw":          args.raw,
        "ir":           args.ir,
        "session_id":   args.session,
        "device_id":    args.device,
        "captured_at":  args.captured_at,
        "retries":      0,
    })

    queue_path.write_text(json.dumps(items, indent=2))


if __name__ == "__main__":
    main()
