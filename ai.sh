#!/usr/bin/env bash
# ========================================================
#  AI HYBRID CLI :: Bash–Python fusion
#  Supports both bash-level command routing and full Python logic.
# ========================================================

# Detect if arguments are for bash-level commands
if [[ "$1" == "--install" ]]; then
  echo "Installing dependencies..."
  pip install requests aiohttp
  exit $?
fi

# Hybrid handover: re-invoke as Python below
# The next exec line tells bash to re-run this script with Python interpreter
exec python3 - "$@" <<'PYCODE'
# -*- coding: utf-8 -*-
"""
AI Hybrid CLI — cloud-first + local consensus
(Autonomous multi-agent builder)
"""

import os, sys, asyncio, argparse, re, json, math, sqlite3, hashlib, subprocess, time
from datetime import datetime
from pathlib import Path
import requests

# --- CONFIG ---
REPO = os.path.expanduser("~/_")
DB_PATH = os.path.join(REPO, "db", "agent.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

LOCAL_MODELS = ["core", "loop", "2244", "coin", "code"]
CLOUD_MODELS = [
    "qwen3-coder:480b-cloud",
    "gpt-oss:120b-cloud",
    "deepseek-v3.1:671b-cloud",
]
OLLAMA_BIN = os.environ.get("OLLAMA_BIN", "ollama")
SESSION = requests.Session()

# --- COLORS ---
class C:
    R='\033[31m';G='\033[32m';Y='\033[33m';B='\033[34m';C='\033[36m';N='\033[0m';BOLD='\033[1m'
    @staticmethod
    def s(t,c,b=False): return f"{c}{C.BOLD if b else ''}{t}{C.N}"
def ok(m): print(C.s("✓ "+m,C.G,1))
def err(m): print(C.s("✗ "+m,C.R,1))
def info(m): print(C.s("ℹ "+m,C.C))

# --- CORE FUNCTIONS (simplified from your version) ---
def ensure_ollama():
    try:
        r=SESSION.get("http://127.0.0.1:11434/api/tags",timeout=3)
        if r.status_code==200: ok("Ollama healthy"); return True
    except: pass
    info("Restarting ollama...")
    subprocess.Popen([OLLAMA_BIN,"serve"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    time.sleep(5)
    try:
        r=SESSION.get("http://127.0.0.1:11434/api/tags",timeout=3)
        if r.status_code==200: ok("Ollama restarted"); return True
    except: pass
    err("Ollama unavailable"); return False

async def run_model(model,prompt):
    try:
        p=await asyncio.create_subprocess_exec(
            OLLAMA_BIN,"run",model,prompt,
            stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        out=""
        while True:
            c=await p.stdout.read(1024)
            if not c: break
            t=c.decode(); print(C.s(t,C.Y),end=''); out+=t
        await p.wait()
        return out
    except Exception as e: return f"[ERROR {model}] {e}"

class Consensus:
    def __init__(self,db): self.db=db
    async def parallel(self,prompt,models):
        res=await asyncio.gather(*[run_model(m,prompt) for m in models],return_exceptions=True)
        outs=[r for r in res if isinstance(r,str) and not r.startswith("[ERROR]")]
        if not outs: return {"output":"No valid results"}
        best=max(outs,key=lambda o:len(o))
        return {"output":best,"total":len(models),"success":len(outs)}

def parse():
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument('targets', nargs='*', help='Main input prompt or task name')
    p.add_argument('-f', '--force', action='store_true', help='Force rebuild or patch')
    p.add_argument('--json', action='store_true', help='Output as JSON')
    return p.parse_args()

async def main():
    a=parse()
    if not a.targets:
        print(__doc__); return
    prompt=' '.join(a.targets)
    if not ensure_ollama(): sys.exit(1)
    conn=sqlite3.connect(DB_PATH)
    try:
        eng=Consensus(conn)
        info("Running consensus...")
        result=await eng.parallel(prompt,CLOUD_MODELS+LOCAL_MODELS)
        if a.json: print(json.dumps(result,indent=2))
        else:
            print(C.s("\n=== CONSENSUS RESULT ===",C.G,1))
            print(result['output'])
    finally: conn.close()

if __name__=="__main__":
    asyncio.run(main())

PYCODE
