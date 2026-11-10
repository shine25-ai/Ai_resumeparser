"""Remove resume records uploaded for testing, through the app's own API.

A record is removed only when BOTH are true:
  1. its "Resume Source Informer Name" is one of the --tag values (default: "PR49 test", "PR51 test"), and
  2. it looks like a test upload: a test-corpus file name (R01_..., X01_...) or an example.com/.org/.net/.co.in email.

By default it only lists what it would remove (dry run). Add --delete to remove them; you are asked to type
DELETE first. Deleting uses DELETE /api/v1/resumes/{id}, which removes the database record and the server's
local copy of the file. It does not remove the S3 copy or the resume's activity log.

Sign-in: set RESUMEPARSER_TOKEN to an access token, or the script asks for an admin email and password.
No packages needed beyond Python 3.8+.

Examples:
  python scripts/cleanup_test_resumes.py --base-url https://resumeparser.shinelogics.com
  python scripts/cleanup_test_resumes.py --base-url https://resumeparser.shinelogics.com --delete
"""
import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_TAGS = ["PR49 test", "PR51 test"]
CORPUS_FILE = re.compile(r"^(R\d{2}|X\d{2})_[\w\-]+\.(pdf|docx?|DOCX?|PDF)$")
TEST_EMAIL = re.compile(r"@example\.(com|org|net|co\.in)$", re.IGNORECASE)
PAGE_SIZE = 100


def call(base, path, token=None, method="GET", body=None):
    req = urllib.request.Request(base.rstrip("/") + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def sign_in(base):
    token = os.getenv("RESUMEPARSER_TOKEN")
    if token:
        return token
    email = input("Admin email: ").strip()
    password = getpass.getpass("Password: ")
    status, data = call(base, "/api/v1/auth/login", method="POST", body={"email": email, "password": password})
    token = (data.get("data") or data).get("access_token") if status == 200 else None
    if not token:
        sys.exit(f"Sign-in failed ({status}): {data.get('message') or data.get('detail') or data}")
    return token


def all_resumes(base, token):
    page, out = 1, []
    while True:
        status, data = call(base, f"/api/v1/resumes/match?sort_by=latest&limit={PAGE_SIZE}&page={page}", token)
        if status != 200:
            sys.exit(f"Could not list resumes ({status}): {data.get('message') or data}")
        body = data.get("data") or data
        out += body.get("resumes") or []
        if page >= (body.get("total_pages") or 1):
            return out
        page += 1


def is_test_record(r, tags):
    p = r.get("parsed_data") or {}
    tagged = (r.get("resume_source_informer_name") or "").strip().lower() in {t.lower() for t in tags}
    looks_test = bool(CORPUS_FILE.match(r.get("original_filename") or "")) or bool(TEST_EMAIL.search(p.get("email") or ""))
    return tagged and looks_test


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", required=True, help="e.g. https://resumeparser.shinelogics.com")
    ap.add_argument("--tag", action="append", help=f"informer name to match (repeatable); default {DEFAULT_TAGS}")
    ap.add_argument("--delete", action="store_true", help="remove the records (default: list only)")
    args = ap.parse_args()
    tags = args.tag or DEFAULT_TAGS

    token = sign_in(args.base_url)
    found = [r for r in all_resumes(args.base_url, token) if is_test_record(r, tags)]
    found.sort(key=lambda r: r.get("candidate_id") or "")
    if not found:
        print(f"No test records found with informer name {tags}.")
        return
    print(f"{len(found)} test record(s) with informer name {tags}:")
    for r in found:
        p = r.get("parsed_data") or {}
        print(f"  {r.get('candidate_id') or '-':8} {r.get('status'):7} {r.get('original_filename'):28} "
              f"{p.get('full_name') or '-':22} {p.get('email') or '-'}")

    if not args.delete:
        print("\nDry run: nothing was removed. Run again with --delete to remove these.")
        return
    if input(f"\nType DELETE to permanently remove these {len(found)} record(s): ").strip() != "DELETE":
        print("Cancelled; nothing was removed.")
        return
    failed = 0
    for r in found:
        status, data = call(args.base_url, f"/api/v1/resumes/{r['id']}", token, method="DELETE")
        ok = status == 200
        failed += not ok
        print(f"  {'removed' if ok else 'FAILED '} {r.get('candidate_id')} {r.get('original_filename')}"
              + ("" if ok else f" ({status}: {data.get('message') or data})"))
    print(f"\nDone: {len(found) - failed} removed, {failed} failed.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
