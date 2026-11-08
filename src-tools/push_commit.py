#!/usr/bin/env python
"""
push-commit.py — 用 GitHub Git Data API 把本地 HEAD 推到远端 main

为什么不 git push：本机 github.com:443 只能走代理，push 长时间超时；
api.github.com 可直连，Git Data API 更快更稳。

用法：python src-tools/push_commit.py
"""

import base64
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER, REPO = "JohnChen30", "bible-screening"


def load_token():
    p = os.path.join(ROOT, ".workbuddy", "gh-device.json")
    if os.path.exists(p):
        return json.load(open(p))["access_token"]
    return os.environ.get("GITHUB_TOKEN")


TOKEN = load_token()
if not TOKEN:
    print("X no token")
    sys.exit(1)


def api(method, path, body=None, timeout=180):
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def git(*args):
    r = subprocess.run(
        ["git", "-c", "core.quotepath=false", *args],
        capture_output=True, text=True, cwd=ROOT,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r.stdout.strip()


ref = api("GET", f"/repos/{OWNER}/{REPO}/git/ref/heads/main")
base = ref["object"]["sha"]
head = git("rev-parse", "HEAD")

if base == head:
    print("OK already synced")
    sys.exit(0)

base_tree = api("GET", f"/repos/{OWNER}/{REPO}/git/commits/{base}")["tree"]["sha"]
print(f"remote {base[:8]} -> local {head[:8]}")

raw = git("diff", "--name-status", base, "HEAD")
changes = []
for line in raw.split("\n"):
    if not line.strip():
        continue
    parts = line.split("\t")
    changes.append((parts[0][0], "\t".join(parts[1:])))

print(f"{len(changes)} files changed")

entries = []
for i, (status, f) in enumerate(changes, 1):
    if status == "D":
        entries.append({"path": f, "mode": "100644", "type": "blob", "sha": None})
        print(f"  [{i}/{len(changes)}] DEL {f}")
        continue
    abs_p = os.path.join(ROOT, f)
    if not os.path.exists(abs_p):
        print(f"  [{i}/{len(changes)}] SKIP {f}")
        continue
    b = open(abs_p, "rb").read()
    blob = api("POST", f"/repos/{OWNER}/{REPO}/git/blobs",
               {"content": base64.b64encode(b).decode(), "encoding": "base64"})
    entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(f"  [{i}/{len(changes)}] {f} ({len(b)//1024}KB)")

tree = api("POST", f"/repos/{OWNER}/{REPO}/git/trees", {"base_tree": base_tree, "tree": entries})
msg = git("log", "-1", "--pretty=%B", "HEAD")
commit = api("POST", f"/repos/{OWNER}/{REPO}/git/commits",
             {"message": msg, "tree": tree["sha"], "parents": [base]})
api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/main", {"sha": commit["sha"], "force": False})
print(f"OK main -> {commit['sha'][:8]}")
