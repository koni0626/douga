from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.douga.client import DougaClient
from scripts.douga.project_builder import create_draft


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an editable Douga draft from a manifest")
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    with DougaClient.from_env() as client:
        result = create_draft(client, args.manifest)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
