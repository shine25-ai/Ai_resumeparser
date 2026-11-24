"""Copy every collection from the Atlas database in .env into a local MongoDB, replacing real email addresses.

Read-only on the source: nothing is written to Atlas.

Email addresses are replaced everywhere they appear as a whole value (including inside nested documents and
lists). Each distinct real address becomes a Gmail plus-address of TEST_BASE (e.g. sethubeowulf+1@gmail.com),
so the same address is used consistently and every message still reaches your own inbox. The super admin's
address is kept so you can sign in.

Text that merely contains an address (free-text notes, resume text) is NOT changed.

  python scripts/clone_atlas_to_local.py                 # clone into resumeparser_local (refuses if it has data)
  python scripts/clone_atlas_to_local.py --replace       # drop the target first, then clone
"""

import argparse
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TARGET_URL = "mongodb://localhost:27017"
TARGET_DB = "resumeparser_local"
TEST_BASE = "sethubeowulf@gmail.com"
KEEP_EMAILS = {"shine@gmail.com"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
BATCH = 500


def _source_from_env() -> tuple:
    """Read the active (uncommented) DATABASE_URL and DATABASE_NAME from .env without printing them."""
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    url = name = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if key == "DATABASE_URL":
                url = value  # the last uncommented value wins, as in the app's settings loader
            elif key == "DATABASE_NAME":
                name = value
    if not url or not name:
        raise SystemExit("DATABASE_URL / DATABASE_NAME not found in .env")
    return url, name


class Anonymizer:
    def __init__(self):
        self.mapping = {}

    def _alias(self, email: str) -> str:
        key = email.lower()
        if key in KEEP_EMAILS:
            return email
        if key not in self.mapping:
            local, _, _ = TEST_BASE.partition("@")
            self.mapping[key] = f"{local}+{len(self.mapping) + 1}@{TEST_BASE.partition('@')[2]}"
        return self.mapping[key]

    def walk(self, value):
        if isinstance(value, dict):
            return {k: self.walk(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.walk(v) for v in value]
        if isinstance(value, str) and EMAIL_RE.match(value.strip()):
            return self._alias(value.strip())
        return value


async def clone(source_url: str, source_db: str, replace: bool) -> None:
    src = AsyncIOMotorClient(source_url, serverSelectionTimeoutMS=15000)[source_db]
    dst_client = AsyncIOMotorClient(TARGET_URL, serverSelectionTimeoutMS=5000)
    dst = dst_client[TARGET_DB]

    existing = await dst.list_collection_names()
    if existing and not replace:
        raise SystemExit(f"{TARGET_DB} already has {len(existing)} collection(s). Re-run with --replace to rebuild it.")
    if replace:
        await dst_client.drop_database(TARGET_DB)
        print(f"Dropped local database {TARGET_DB}")

    anon = Anonymizer()
    total = 0
    for name in sorted(await src.list_collection_names()):
        if name.startswith("system."):
            continue
        count = 0
        batch = []
        async for doc in src[name].find({}):
            batch.append(anon.walk(doc))
            if len(batch) >= BATCH:
                await dst[name].insert_many(batch, ordered=False)
                count += len(batch)
                batch = []
        if batch:
            await dst[name].insert_many(batch, ordered=False)
            count += len(batch)
        total += count
        print(f"  {name}: {count}")

    print(f"\nCopied {total} document(s) into {TARGET_DB}.")
    print(f"Replaced {len(anon.mapping)} distinct email address(es) with {TEST_BASE} plus-aliases.")
    dst_client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replace", action="store_true", help="drop the local target database first")
    args = parser.parse_args()
    url, name = _source_from_env()
    if "localhost" in url or "127.0.0.1" in url:
        raise SystemExit("The source in .env is already local; nothing to clone.")
    asyncio.run(clone(url, name, args.replace))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
