"""CLI entry point for the desktop automation agent."""

import argparse
import sys
import json


def cli() -> None:
    parser = argparse.ArgumentParser(
        description="GuestFill Desktop Agent - Fill guest data into desktop applications"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    fill_parser = subparsers.add_parser("fill", help="Fill guest data into a desktop application")
    fill_parser.add_argument("--request", required=True, help="Path to request JSON file")
    fill_parser.add_argument("--response", required=True, help="Path to write response JSON")

    args = parser.parse_args()

    if args.command == "fill":
        _handle_fill(args.request, args.response)


def _handle_fill(request_path: str, response_path: str) -> None:
    try:
        with open(request_path, "r", encoding="utf-8") as f:
            request = json.load(f)
    except Exception as e:
        _write_error(response_path, f"Failed to read request: {e}")
        sys.exit(1)

    response = {
        "jobId": request.get("jobId", "unknown"),
        "status": "COMPLETED_PLACEHOLDER",
        "templateId": request.get("templateId"),
        "guestId": request.get("guestId"),
        "filledFields": 0,
        "errors": [
            {
                "code": "PLACEHOLDER",
                "message": "Desktop automation is not yet implemented. This is a placeholder.",
            }
        ],
    }

    with open(response_path, "w", encoding="utf-8") as f:
        json.dump(response, f, indent=2)


def _write_error(path: str, message: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"status": "FAILED", "message": message}, f, indent=2)
