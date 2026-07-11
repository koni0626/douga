import subprocess
import sys


def run() -> None:
    raise SystemExit(subprocess.call([sys.executable, "-m", "dramatiq", "douga.worker_tasks"]))
