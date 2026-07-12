from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "apps" / "backend" / "src"))


def export_contracts(output_directory: Path) -> None:
    from douga.api_main import create_app

    output_directory.mkdir(parents=True, exist_ok=True)
    openapi_path = output_directory / "openapi-v1.json"
    openapi_path.write_text(
        json.dumps(create_app().openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    schema_source = Path("packages/project-schema/schema/project-v1.schema.json")
    shutil.copyfile(schema_source, output_directory / schema_source.name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Douga API contract artifacts")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    export_contracts(args.output)


if __name__ == "__main__":
    main()
