"""Write the API's OpenAPI document to a file (the contract the TypeScript client is built from).

Usage: uv run python scripts/export_openapi.py ../../packages/api-client/openapi.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from buddy_coach.core.config import Environment, Settings
from buddy_coach.core.db import Database
from buddy_coach.main import create_app

# The schema does not depend on secrets or a database; these values are never used.
_UNUSED_DB = "postgresql+asyncpg://nobody@127.0.0.1:1/none"


def main() -> None:
    """Build the app without a database and dump its OpenAPI schema."""
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
    settings = Settings(
        environment=Environment.TEST,
        database_url=_UNUSED_DB,
        jwt_secret="openapi-export-only-" + "x" * 32,
    )
    app = create_app(settings, database=Database(_UNUSED_DB, use_null_pool=True))
    target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
