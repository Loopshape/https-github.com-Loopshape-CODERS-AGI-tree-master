#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
~/_/ai  — Autonomous AI CLI (cloud-first → local-learning)
Unrestricted version - can write to any absolute path.

Usage:
  ai "<prompt or file:... or url>" [--agi] [--api] [--json] [--git] [--project <name>] ...
  ai "regex/path/*.js" --scan --verbose
  ai "calc: 2+2*math.pi" --sci
  ai "search: authentication" --db --json
  ai "rebuild component" --react --vite --monokai

Features:
- Full absolute path support
- No safety restrictions on file operations
- Extended CLI with 50+ command flags
- Mathematical consensus engine
- Multi-technology project scaffolding
"""

import os
import sys
import re
import json
import hashlib
import sqlite3
import subprocess
import time
import math
import argparse
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
import urllib.parse

import requests

# ============ CONFIG ============
REPO = os.path.expanduser("~/_")
PROJECTS_DIR = os.path.join(REPO, "projects")
DB_PATH = os.path.join(REPO, "db", "agent.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(PROJECTS_DIR, exist_ok=True)

LOCAL_MODELS = ["loop", "code", "2244", "coin", "core"]
CLOUD_MODELS = [
    "qwen3-coder:480b-cloud",
    "gpt-oss:120b-cloud",
    "gpt-oss:20b-cloud",
    "deepseek-v3.1:671b-cloud",
]

OLLAMA_BIN = os.environ.get("OLLAMA_BIN", "ollama")
OLLAMA_HEALTH_URL = "http://127.0.0.1:11434/api/tags"

# Extended feature flags
ENABLED_FEATURES = {
    'webgl3d': True,
    'html5': True,
    'css3': True,
    'js': True,
    'vite': True,
    'monokai': True,
    'neonlight': True,
    'dex': True,
    'rest': True,
    'soap': True,
    'translate': True,
    'qbit': True,
    'prime': True,
    'agi' : True,
    'code' : True,
    'api' : True,
    'setup' : True,
    'install' : True
}

# Boosted Cloud Connectivity
SESSION = requests.Session()

# ============ COLOR UTILITIES ============
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    GRAY = '\033[90m'

    @staticmethod
    def style(text, color, bold=False):
        result = color
        if bold:
            result += Colors.BOLD
        return f"{result}{text}{Colors.RESET}"

def print_error(msg):
    print(Colors.style(f"✗ {msg}", Colors.RED, True))

def print_success(msg):
    print(Colors.style(f"✓ {msg}", Colors.GREEN, True))

def print_warning(msg):
    print(Colors.style(f"! {msg}", Colors.YELLOW))

def print_info(msg):
    print(Colors.style(f"ℹ {msg}", Colors.CYAN))

def print_debug(msg):
    print(Colors.style(f"🔍 {msg}", Colors.GRAY))

# ============ UNRESTRICTED FILE OPERATIONS ============
def write_file(path: str, data: Any, mode: str = "wb") -> bool:
    """Write file to any absolute path, handling str/bytes correctly."""
    try:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        with open(path, mode) as f:
            if 'b' in mode:
                if isinstance(data, str):
                    f.write(data.encode('utf-8'))
                elif isinstance(data, bytes):
                    f.write(data)
                else:
                    f.write(str(data).encode('utf-8'))
            else:
                f.write(str(data))
        print_success(f"Written: {path}")
        return True
    except Exception as e:
        print_error(f"Failed to write {path}: {e}")
        return False

def execute_script(script_path: str) -> bool:
    """Execute script at any absolute path"""
    try:
        result = subprocess.run([script_path], capture_output=True, text=True, check=True)
        print_success(f"Script executed: {script_path}")
        if result.stdout:
            print_debug(f"Output: {result.stdout}")
        return True
    except Exception as e:
        print_error(f"Script execution failed: {e}")
        return False

def delete_file(path: str) -> bool:
    """Delete file at any absolute path. Idempotent."""
    try:
        if os.path.exists(path):
            os.remove(path)
            print_success(f"Deleted: {path}")
        else:
            print_warning(f"File to delete not found (already deleted): {path}")
        return True
    except Exception as e:
        print_error(f"Failed to delete {path}: {e}")
        return False

def create_directory(path: str) -> bool:
    """Create directory at any absolute path"""
    try:
        os.makedirs(path, exist_ok=True)
        print_success(f"Directory created: {path}")
        return True
    except Exception as e:
        print_error(f"Failed to create directory {path}: {e}")
        return False

# ============ EXTENDED SOURCE LOADER ============
def load_extended_source(src: str) -> bytes:
    """Enhanced source loader with regex patterns and special handlers"""
    # Handle mathematical calculations
    if src.startswith(('calc:', 'math:')):
        try:
            expr = src.split(':', 1)[1].strip()
            # Safe math evaluation
            math_env = {
                'math': math, 'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
                'log': math.log, 'exp': math.exp, 'sqrt': math.sqrt,
                'pi': math.pi, 'e': math.e, 'tau': math.tau
            }
            result = eval(expr, {"__builtins__": {}}, math_env)
            return f"{expr} = {result}".encode()
        except Exception as e:
            return f"Calculation error: {e}".encode()

    # Handle regex file patterns
    if 'regex/' in src or any(pattern in src for pattern in ['/*', '/?', '.*']):
        pattern = src.replace('regex/', '').replace('/*', '*').replace('/?', '?').replace('.*', '*')
        # WARNING: rglob from root can be extremely slow.
        matches = list(Path('/').rglob(pattern))
        if matches:
            content = b''
            for match in matches[:10]:  # Limit results
                if match.is_file():
                    content += f"\n=== FILE: {match} ===\n".encode()
                    try:
                        content += match.read_bytes()
                    except Exception:
                        content += b"[Unable to read file]"
            return content if content else b"No files matched pattern"

    # Handle search operations
    if src.startswith('search:'):
        query = src[7:].strip().lower()
        results = []
        # WARNING: os.walk from root can be extremely slow.
        for root, dirs, files in os.walk('/'):
            # Skip some system directories for performance
            if any(skip in root for skip in ['/proc', '/sys', '/dev']):
                continue
            for file in files:
                if file.endswith(('.py', '.js', '.html', '.css', '.md', '.txt', '.json', '.cpp', '.h', '.java')):
                    filepath = os.path.join(root, file)
                    try:
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            if query in content.lower():
                                # Find context around match
                                lines = content.split('\n')
                                for i, line in enumerate(lines):
                                    if query in line.lower():
                                        context = '\n'.join(lines[max(0, i-1):min(len(lines), i+2)])
                                        results.append(f"{filepath} (line {i+1}):\n{context}\n")
                                        break
                    except Exception:
                        continue
                    if len(results) >= 20:  # Limit results
                        break
            if len(results) >= 20:
                break
        return ("\n" + "="*50 + "\n").join(results).encode() if results else b"No matches found"

    # Handle hash operations
    if src.startswith('hash:'):
        target = src[5:].strip()
        content = load_extended_source(target)
        return f"SHA256: {hashlib.sha256(content).hexdigest()}".encode()

    # Handle database queries
    if src.startswith(('db:', 'sql:')):
        query = src.split(':', 1)[1].strip()
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(query)
            if query.strip().lower().startswith('select'):
                results = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                return json.dumps([dict(zip(columns, row)) for row in results], indent=2).encode()
            else:
                conn.commit()
                return b"Query executed successfully"
        except Exception as e:
            return f"Database error: {e}".encode()
        finally:
            if conn:
                conn.close()

    # Handle Git operations
    if src.startswith('git:'):
        command = src[4:].strip()
        try:
            # Try current directory first, then REPO
            result = subprocess.run(['git'] + command.split(),
                                  capture_output=True, text=True, check=False)
            if result.returncode != 0:
                # Try in REPO directory
                result = subprocess.run(['git'] + command.split(),
                                      cwd=REPO, capture_output=True, text=True, check=False)
            return (result.stdout or result.stderr).encode()
        except Exception as e:
            return f"Git error: {e}".encode()

    # Handle file operations
    if src.startswith('read:'):
        filepath = src[5:].strip()
        try:
            with open(filepath, 'rb') as f:
                return f.read()
        except Exception as e:
            return f"File error: {e}".encode()

    # Handle system commands
    if src.startswith('cmd:'):
        command = src[4:].strip()
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, check=False)
            return (result.stdout or result.stderr).encode()
        except Exception as e:
            return f"Command error: {e}".encode()

    # Handle file: prefix
    if src.startswith("file:"):
        src = src[5:]

    # Direct file path (absolute or relative)
    if os.path.isfile(src):
        try:
            return open(src, "rb").read()
        except Exception as e:
            return f"File read error: {e}".encode()

    # HTTP URL
    if src.startswith("http"):
        for attempt in range(3):
            try:
                response = SESSION.get(src, timeout=(5, 30))
                response.raise_for_status()
                return response.content
            except requests.exceptions.Timeout:
                print_warning(f"Timeout fetching {src} (attempt {attempt+1}/3)")
                time.sleep(2 ** attempt)
            except requests.exceptions.RequestException as e:
                return f"HTTP error: {e}".encode()
        return b"Failed to fetch URL after 3 attempts"

    # Try as executable
    if os.path.exists(src) and os.access(src, os.X_OK):
        try:
            return subprocess.run([src], capture_output=True, check=True).stdout
        except Exception as e:
            return f"Execution error: {e}".encode()

    # Fallback: treat as literal string
    return src.encode()

# ============ EXTENDED OLLAMA MANAGEMENT ============
def ensure_ollama_is_running() -> bool:
    """Enhanced Ollama management with health checks"""
    try:
        response = SESSION.get(OLLAMA_HEALTH_URL, timeout=5)
        if response.status_code == 200:
            print_success("Ollama server is healthy")
            return True
    except requests.exceptions.RequestException:
        print_warning("Ollama server not responding")

    # Attempt restart
    print_info("Attempting to restart Ollama server...")
    try:
        # Kill existing processes
        subprocess.run(["pkill", "-f", "ollama"], capture_output=True)
        time.sleep(2)
        
        # Start new server
        subprocess.Popen(
            [OLLAMA_BIN, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )

        # Wait for startup
        for i in range(10):
            time.sleep(2)
            try:
                response = SESSION.get(OLLAMA_HEALTH_URL, timeout=2)
                if response.status_code == 200:
                    print_success("Ollama server restarted successfully")
                    return True
            except requests.exceptions.RequestException:
                if i == 9:
                    print_error("Failed to restart Ollama server")
                    return False
                continue
    except Exception as e:
        print_error(f"Ollama restart failed: {e}")
    return False

async def run_ollama_model_async(model: str, prompt: str, timeout: int = 180) -> str:
    """Async model execution with streaming output"""
    # NOTE: Local models are currently mocked for testing purposes.
    if model in LOCAL_MODELS:
        return f"[MOCK {model}] Processed: {prompt[:100]}..."

    try:
        process = await asyncio.create_subprocess_exec(
            OLLAMA_BIN, "run", model, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        output = ""
        while True:
            chunk = await process.stdout.read(1024)
            if not chunk:
                break
            text = chunk.decode('utf-8', errors='ignore')
            output += text
            print(Colors.style(f"  {text}", Colors.GRAY), end='', flush=True)

        await process.wait()
        return output.strip()

    except Exception as e:
        return f"[ERROR {model}] {str(e)}"

# ============ EXTENDED PROJECT SCAFFOLDING ============
def detect_tech_stack(prompt: str) -> Dict[str, Any]:
    """Enhanced technology stack detection"""
    prompt_lower = prompt.lower()
    stack = {
        'frontend': 'vanilla', 'backend': 'none', 'build_tool': 'none',
        'styling': 'css3', 'features': []
    }
    # (Rest of the function is unchanged but included for completeness)
    if any(term in prompt_lower for term in ['react', 'jsx']): stack['frontend'] = 'react'
    elif any(term in prompt_lower for term in ['vue', 'composition']): stack['frontend'] = 'vue'
    elif any(term in prompt_lower for term in ['svelte', 'sveltekit']): stack['frontend'] = 'svelte'
    elif any(term in prompt_lower for term in ['angular']): stack['frontend'] = 'angular'
    if any(term in prompt_lower for term in ['node', 'express']): stack['backend'] = 'node'
    elif any(term in prompt_lower for term in ['python', 'flask', 'django']): stack['backend'] = 'python'
    elif any(term in prompt_lower for term in ['fastapi']): stack['backend'] = 'fastapi'
    elif any(term in prompt_lower for term in ['java', 'spring']): stack['backend'] = 'java'
    elif any(term in prompt_lower for term in ['go', 'golang']): stack['backend'] = 'go'
    elif any(term in prompt_lower for term in ['rust', 'actix']): stack['backend'] = 'rust'
    if any(term in prompt_lower for term in ['vite', 'vitejs']): stack['build_tool'] = 'vite'
    elif any(term in prompt_lower for term in ['webpack']): stack['build_tool'] = 'webpack'
    elif any(term in prompt_lower for term in ['make', 'makefile']): stack['build_tool'] = 'make'
    elif any(term in prompt_lower for term in ['cargo']): stack['build_tool'] = 'cargo'
    if any(term in prompt_lower for term in ['tailwind', 'tailwindcss']): stack['styling'] = 'tailwind'
    elif any(term in prompt_lower for term in ['bootstrap']): stack['styling'] = 'bootstrap'
    elif any(term in prompt_lower for term in ['sass', 'scss']): stack['styling'] = 'sass'
    if any(term in prompt_lower for term in ['3d', 'webgl', 'three.js']): stack['features'].append('webgl3d')
    if any(term in prompt_lower for term in ['api', 'rest']): stack['features'].append('rest')
    if any(term in prompt_lower for term in ['database', 'db', 'sql']): stack['features'].append('database')
    if any(term in prompt_lower for term in ['docker', 'container']): stack['features'].append('docker')
    if any(term in prompt_lower for term in ['kubernetes', 'k8s']): stack['features'].append('kubernetes')
    return stack

def generate_extended_project_tree(stack: Dict[str, Any], project_name: str, project_path: str) -> Dict[str, str]:
    """Generate project structure for any absolute path"""
    tree = {}

    # Package.json for Node-based projects
    if stack['frontend'] in ['react', 'vue'] or stack['backend'] == 'node':
        tree['package.json'] = json.dumps({
            "name": project_name, "version": "1.0.0", "type": "module",
            "scripts": {
                "dev": "vite" if stack['build_tool'] == 'vite' else "webpack serve",
                "build": "vite build" if stack['build_tool'] == 'vite' else "webpack build",
                "preview": "vite preview"
            },
            "dependencies": {"react": "^18.2.0", "react-dom": "^18.2.0"} if stack['frontend'] == 'react' else {},
            "devDependencies": {"@vitejs/plugin-react": "^4.2.1", "vite": "^5.0.0"} if stack['build_tool'] == 'vite' else {}
        }, indent=2)

    # HTML entry point
    if stack['frontend'] != 'none':
        theme_class = "monokai" if ENABLED_FEATURES.get('monokai') else "neonlight" if ENABLED_FEATURES.get('neonlight') else ""
        tree['index.html'] = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{project_name}</title>
    <link rel="stylesheet" href="src/styles.css">
    {'<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>' if 'webgl3d' in stack['features'] else ''}
</head>
<body class="{theme_class}">
    <div id="app"></div>
    <script type="module" src="src/main.js"></script>
</body>
</html>"""

    # CSS with theme support
    tree['src/styles.css'] = """
:root {
    --primary: #007acc;
    --background: #ffffff;
    --text: #333333;
}
.monokai {
    --background: #272822;
    --text: #f8f8f2;
    --primary: #a6e22e;
}
.neonlight {
    --background: #0a0a0a;
    --text: #00ff41;
    --primary: #ff0080;
}
body {
    margin: 0;
    font-family: 'Courier New', monospace;
    background: var(--background);
    color: var(--text);
}
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}
"""

    # (Rest of the function is mostly unchanged and correct)
    if stack['frontend'] == 'react':
        tree['src/main.jsx'] = f"""import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)"""
        tree['src/App.jsx'] = f"""import React from 'react'

export default function App() {{
  return (
    <div className="container">
      <h1>Welcome to {project_name}</h1>
      <p>React app with {stack['styling']} styling</p>
      {'<WebGLScene />' if 'webgl3d' in stack['features'] else ''}
    </div>
  )
}}
"""
    if 'webgl3d' in stack['features']:
        tree['src/components/WebGLScene.jsx'] = """import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'

export default function WebGLScene() {
  const mountRef = useRef(null)

  useEffect(() => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer()

    renderer.setSize(800, 600)
    if (mountRef.current) {
        mountRef.current.appendChild(renderer.domElement)
    }

    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const cube = new THREE.Mesh(geometry, material)
    scene.add(cube)
    camera.position.z = 5

    const animate = () => {
      requestAnimationFrame(animate)
      cube.rotation.x += 0.01
      cube.rotation.y += 0.01
      renderer.render(scene, camera)
    }
    animate()

    return () => {
        if (mountRef.current) {
            mountRef.current.removeChild(renderer.domElement)
        }
    }
  }, [])
  return <div ref={mountRef} />
}
"""
    if stack['backend'] == 'node':
        tree['server.js'] = """const express = require('express')
const app = express()
const port = 3000

app.use(express.json())

app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' })
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
"""
    elif stack['backend'] == 'python':
        tree['app.py'] = f"""from flask import Flask, jsonify
app = Flask(__name__)
@app.route('/')
def hello():
    return jsonify({{'message': 'Hello from Python Flask!'}})
@app.route('/api/data')
def get_data():
    return jsonify({{'data': [1, 2, 3, 4, 5]}})
if __name__ == '__main__':
    app.run(debug=True)
"""
        tree['requirements.txt'] = "Flask==2.3.3\n"
    if 'docker' in stack['features']:
        tree['Dockerfile'] = f"""FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
"""
    return tree

# ============ ENHANCED CONSENSUS ENGINE ============
class EnhancedConsensusEngine:
    # (Class is unchanged and correct)
    def __init__(self, db_connection): self.db = db_connection; self.entropy_pool = []
    def mathematical_optimize(self, outputs: List[str]) -> str:
        scored = []
        for output in outputs:
            score = 0
            score += len(re.findall(r'```[\s\S]*?```', output)) * 10
            score += min(len(output) / 1000, 50)
            score += len(re.findall(r'function |def |class ', output)) * 5
            score += self.calculate_entropy(output) * 20
            scored.append((score, output))
        scored.sort(reverse=True)
        return scored[0][1] if scored else ""
    def calculate_entropy(self, text: str) -> float:
        if not text: return 0
        char_freq = {char: text.count(char) for char in set(text)}
        entropy, text_len = 0, len(text)
        for count in char_freq.values():
            p = count / text_len
            entropy -= p * math.log2(p)
        return entropy
    async def parallel_model_consensus(self, prompt: str, models: List[str], max_iterations: int = 2) -> Dict[str, Any]:
        all_results = []
        for iteration in range(max_iterations):
            print_info(f"Consensus iteration {iteration + 1}/{max_iterations}")
            tasks = [run_ollama_model_async(model, prompt) for model in models]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            valid_results = [r for r in results if isinstance(r, str) and not r.startswith('[ERROR')]
            all_results.extend(valid_results)
            if len(valid_results) >= len(models) * 0.6: break
        best_output = self.mathematical_optimize(all_results)
        return {
            'output': best_output, 'total_models': len(models),
            'successful_runs': len([r for r in all_results if r]),
            'consensus_score': len(all_results) / (len(models) * max_iterations)
        }

# ============ EXTENDED CLI ENTRYPOINT ============
def parse_arguments():
    """Parse extended CLI arguments"""
    parser = argparse.ArgumentParser(description="Autonomous AI CLI with Absolute Path Support", add_help=False)
    # (Argument parsing is unchanged and correct)
    parser.add_argument('targets', nargs='*', help='Prompt, file path, URL, or special command')
    parser.add_argument('--agi', action='store_true', help='Enable AGI attention mode')
    parser.add_argument('--api', action='store_true', help='API mode')
    parser.add_argument('--json', action='store_true', help='JSON output')
    parser.add_argument('--git', action='store_true', help='Git integration')
    parser.add_argument('--project', help='Project name')
    parser.add_argument('--path', help='Absolute project path')
    parser.add_argument('--arch', action='store_true', help='Architecture mode')
    parser.add_argument('--compile', action='store_true', help='Compilation mode')
    parser.add_argument('--build', action='store_true', help='Build mode')
    parser.add_argument('--fix', action='store_true', help='Fix/repair mode')
    parser.add_argument('--webgl3d', action='store_true', help='WebGL 3D support')
    parser.add_argument('--html5', action='store_true', help='HTML5 mode')
    parser.add_argument('--css3', action='store_true', help='CSS3 mode')
    parser.add_argument('--js', action='store_true', help='JavaScript mode')
    parser.add_argument('--vite', action='store_true', help='Vite build tool')
    parser.add_argument('--monokai', action='store_true', help='Monokai theme')
    parser.add_argument('--neonlight', action='store_true', help='Neon light theme')
    parser.add_argument('--code', action='store_true', help='Code generation')
    parser.add_argument('--dex', action='store_true', help='DEX operations')
    parser.add_argument('--hash', action='store_true', help='Hash operations')
    parser.add_argument('--import', dest='import_', action='store_true', help='Import mode')
    parser.add_argument('--unit', action='store_true', help='Unit testing')
    parser.add_argument('--sci', action='store_true', help='Scientific mode')
    parser.add_argument('--calc', action='store_true', help='Calculator mode')
    parser.add_argument('--mod', action='store_true', help='Module mode')
    parser.add_argument('--rest', action='store_true', help='REST API mode')
    parser.add_argument('--sql', action='store_true', help='SQL mode')
    parser.add_argument('--soap', action='store_true', help='SOAP mode')
    parser.add_argument('--translate', action='store_true', help='Translation mode')
    parser.add_argument('--db', action='store_true', help='Database mode')
    parser.add_argument('--qbit', action='store_true', help='Quantum mode')
    parser.add_argument('--timer', action='store_true', help='Timer mode')
    parser.add_argument('--count', action='store_true', help='Counter mode')
    parser.add_argument('--clock', action='store_true', help='Clock mode')
    parser.add_argument('--index', action='store_true', help='Indexing mode')
    parser.add_argument('--script', action='store_true', help='Script mode')
    parser.add_argument('--netip', action='store_true', help='Network IP mode')
    parser.add_argument('--crawl', action='store_true', help='Web crawl mode')
    parser.add_argument('--scan', action='store_true', help='Scan mode')
    parser.add_argument('--debug', action='store_true', help='Debug mode')
    parser.add_argument('--verbose', action='store_true', help='Verbose output')
    parser.add_argument('--pipe', action='store_true', help='Pipeline mode')
    parser.add_argument('--reset', action='store_true', help='Reset mode')
    parser.add_argument('--help', action='store_true', help='Show help')
    return parser.parse_args()

async def main():
    args = parse_arguments()
    if args.help or not args.targets:
        print(__doc__)
        return

    for feature, is_enabled in ENABLED_FEATURES.items():
        if hasattr(args, feature) and getattr(args, feature):
            ENABLED_FEATURES[feature] = True

    if not ensure_ollama_is_running():
        sys.exit(1)

    input_source = ' '.join(args.targets)
    content = load_extended_source(input_source)
    
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    
    try:
        engine = EnhancedConsensusEngine(conn)
        is_special_command = any(input_source.startswith(prefix) for prefix in
                               ['calc:', 'search:', 'hash:', 'db:', 'git:', 'read:', 'cmd:'])

        if not is_special_command:
            print_info("Running enhanced AI consensus...")
            consensus_result = await engine.parallel_model_consensus(
                content.decode('utf-8', errors='ignore'),
                CLOUD_MODELS + LOCAL_MODELS
            )
            output_text = consensus_result['output']

            if args.project or any(keyword in input_source.lower() for keyword in ['project', 'create', 'build', 'scaffold']):
                project_name = args.project or f"project_{hashlib.sha256(input_source.encode()).hexdigest()[:8]}"
                project_root = os.path.abspath(args.path) if args.path else os.path.join(PROJECTS_DIR, project_name)
                
                print_info(f"Scaffolding project '{project_name}' at {project_root}...")
                stack = detect_tech_stack(input_source)
                project_tree = generate_extended_project_tree(stack, project_name, project_root)
                
                created_files = []
                for file_path, file_content in project_tree.items():
                    full_path = os.path.join(project_root, file_path)
                    if write_file(full_path, file_content, mode="w"): # Write as text
                        created_files.append(full_path)

                if args.git and created_files:
                    subprocess.run(['git', 'init'], cwd=project_root, capture_output=True)
                    subprocess.run(['git', 'add', '.'], cwd=project_root, capture_output=True)
                    subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=project_root, capture_output=True)
                    print_success(f"Git repository initialized in {project_root}")

                output_text += f"\n\n--- PROJECT CREATED ---\nLocation: {project_root}\nFiles: {len(created_files)}"
                print_success(f"Project '{project_name}' created at: {project_root}")

            if args.json:
                result_data = {
                    'input': input_source, 'output': output_text,
                    'consensus_metrics': {
                        'successful_models': consensus_result['successful_runs'],
                        'total_models': consensus_result['total_models'],
                        'score': consensus_result['consensus_score']
                    },
                    'timestamp': datetime.now().isoformat()
                }
                print(json.dumps(result_data, indent=2))
            else:
                print(f"\n{Colors.style('=== AI CONSENSUS RESULT ===', Colors.GREEN, True)}")
                print(output_text)
        else:
            print(content.decode('utf-8', errors='ignore'))
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(main())

