#!/bin/bash

# ███████╗██╗   ██╗███████╗ ██████╗ ██████╗ █████╗ ██╗
# ██╔════╝╚██╗ ██╔╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗██║
# ███████╗ ╚████╔╝ █████╗  ██║   ██║██████╔╝███████║██║
# ╚════██║  ╚██╔╝  ██╔══╝  ██║   ██║██╔═══╝ ██╔══██║██║
# ███████║   ██║   ███████╗╚██████╔╝██║     ██║  ██║███████╗
# ╚══════╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚══════╝
#
# SysOp-AI: A self-contained AI orchestration framework for local LLMs.
# Version: 54 (Single-File Bash Rebuild)

# --- Environment & Configuration ---
export AI_HOME="${AI_HOME:-$HOME/.sysop-ai}"
export TASKS_DIR="$AI_HOME/tasks"
export PROJECTS_DIR="$AI_HOME/projects"
export DB_DIR="$AI_HOME/db"
export SSH_DIR="$AI_HOME/ssh"
export AI_DATA_DB="$DB_DIR/ai_data.db"
export BLOBS_DB="$DB_DIR/blobs.db"
export WALLET_DB="$DB_DIR/wallet.db"
export SESSION_FILE="$AI_HOME/.session"
export OLLAMA_BIN="ollama"
export ORCHESTRATOR_JS="$AI_HOME/orchestrator.js"
export MANAGER_PY="$AI_HOME/manager.py"
export PROJECT_MODE=0 # 0: Default, 1: Interactive Session

# --- Utility Functions ---

# Check for required dependencies
check_dependencies() {
    local missing_deps=()
    local deps=("sqlite3" "node" "python3" "git" "$OLLAMA_BIN")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo -e "\n\x1b[31mError: Missing required dependencies: ${missing_deps[*]}.\x1b[0m Please install them and try again." >&2
        exit 1
    fi
}

# Log an event to console and DB
log_event() {
    echo -e "[\x1b[34m$1\x1b[0m] $(date +%H:%M:%S): $2"
    sqlite3 "$AI_DATA_DB" "INSERT INTO events (event_type, message) VALUES ('$1', '$2');" 2>/dev/null
}

# --- Setup Scripts and Databases (Self-Bootstrapping) ---

setup_environment() {
    mkdir -p "$AI_HOME" "$TASKS_DIR" "$PROJECTS_DIR" "$DB_DIR" "$SSH_DIR"

    # 1. Write the JavaScript Orchestrator (Core AI Logic)
    cat > "$ORCHESTRATOR_JS" << 'EOF_JS'
const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Environment variables are inherited from the parent shell
const AI_HOME = process.env.AI_HOME;
const PROJECTS_DIR = process.env.PROJECTS_DIR;
const AI_DATA_DB_PATH = process.env.AI_DATA_DB;
const BLOBS_DB_PATH = process.env.BLOBS_DB;
const OLLAMA_BIN = process.env.OLLAMA_BIN || 'ollama';

// Use a consistent, small pool for quick consensus checks
const MODEL_POOL = ["phi3:latest", "llama3:8b", "codegemma:7b"];

const aiDataDb = new sqlite3.Database(AI_DATA_DB_PATH);
const blobsDb = new sqlite3.Database(BLOBS_DB_PATH);

// Helper function for logging to the shell console and DB (via DB connection)
const log = (type, message) => {
    aiDataDb.run("INSERT INTO events (event_type, message) VALUES (?, ?)", [type, message]);
    // The bash script handles the colorful console output for simplicity
};

// --- ProofTracker System (The Blockchain Strain) ---
class ProofTracker {
    constructor(initialPrompt) {
        this.cycleIndex = initialPrompt.length;
        this.netWorthIndex = (this.cycleIndex % 128) << 2;
        this.entropyRatio = (this.cycleIndex ^ Date.now()) / 1000;
        log('PROOF_INIT', `Initial state set: ${JSON.stringify(this.getState())}`);
    }
    crosslineEntropy(data) {
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        this.entropyRatio += parseInt(hash.substring(0, 8), 16);
        log('PROOF_CROSSLINE', `Entropy updated.`);
    }
    proofCycle(converged) {
        this.cycleIndex += converged ? 1 : 0;
        this.netWorthIndex -= converged ? 0 : 1;
        log('PROOF_CYCLE', `Cycle check: Converged=${converged}`);
    }
    getState() { return { cycleIndex: this.cycleIndex, netWorthIndex: this.netWorthIndex, entropyRatio: this.entropyRatio }; }
}

// --- AI Orchestrator (Main Loop) ---
class AIOrchestrator {
    constructor(prompt, options) {
        this.initialPrompt = prompt;
        this.options = options;
        // Task ID based on SHA256 timestamping
        this.taskId = crypto.createHash('sha256').update(Date.now().toString()).digest('hex').substring(0, 12);
        this.proofTracker = new ProofTracker(prompt);
    }

    // Runs a single Ollama model, streaming output and ensuring verbosity
    runOllama(model, currentPrompt) {
        return new Promise((resolve, reject) => {
            console.log(`\n\x1b[35m[MODEL_THINKING]\x1b[0m \x1b[33m${model}\x1b[0m is processing... (Realtime stream below)`);
            
            // Explicit model thinking verbosity
            const verbosityPrompt = `## Model Thinking Verbosity\n\nAs you process the request, output your thinking steps clearly before the final output. The final output must be in the requested format (e.g., code blocks).\n\nOriginal Request:\n${currentPrompt}`;
            const command = `${OLLAMA_BIN} run ${model} "${verbosityPrompt.replace(/"/g, '\\"')}"`;
            
            const child = exec(command, { maxBuffer: 1024 * 1024 * 50 });
            let output = '';
            
            child.stdout.on('data', (data) => {
                // Syntax highlighting simulation: Bold keywords for common languages
                let formattedData = data.toString();
                formattedData = formattedData.replace(/\b(function|const|let|var|if|else|return|for|while|import|export|class|def|async|await|select|from|where|CREATE|UPDATE|DELETE)\b/g, '\x1b[1m$&\x1b[0m');
                process.stdout.write(formattedData);
                output += data;
            });
            child.stderr.on('data', (data) => process.stderr.write(data));
            
            child.on('close', (code) => {
                if (code !== 0) {
                    log('MODEL_FAIL', `Model ${model} exited with code ${code}`);
                    return reject(`Model ${model} failed.`);
                }
                resolve(output.trim());
            });
        });
    }

    // --- Recursive Consensus Engine ---
    async recursiveConsensus() {
        let currentPrompt = this.initialPrompt;
        let lastFusedOutput = "";
        let converged = false;

        for (let i = 0; i < 5 && !converged; i++) {
            console.log(`\n\x1b[1;36m--- Consensus Iteration ${i + 1} / 5 ---\x1b[0m`);
            const promises = MODEL_POOL.map(model => this.runOllama(model, currentPrompt).catch(e => e));
            const results = await Promise.all(promises);
            const validResults = results.filter(r => typeof r === 'string' && r.length > 0);
            
            if (validResults.length === 0) return "Error: All models failed to respond.";
            
            // Fusing by simple concatenation for detailed processing output
            const fusedOutput = validResults.join('\n\n\x1b[3m[Consensus Delimiter]\x1b[0m\n\n').trim();

            if (fusedOutput === lastFusedOutput) {
                converged = true;
                this.proofTracker.proofCycle(true);
            } else {
                this.proofTracker.proofCycle(false);
            }
            
            lastFusedOutput = fusedOutput;
            currentPrompt += `\n[PREVIOUS ITERATION OUTPUT]\n${fusedOutput}`;
        }
        return lastFusedOutput;
    }

    // --- File Generation and Validation ---
    parseCodeBlocks(content) {
        // Detects ```language ... ``` blocks
        return [...content.matchAll(/```(\w+)\s*([\s\S]*?)```/g)].map(match => ({
            language: match[1].toLowerCase(),
            code: match[2].trim(),
        }));
    }

    async handleCodeGeneration(content) {
        const blocks = this.parseCodeBlocks(content);
        if (blocks.length === 0) return;

        const projectName = this.options.project || `task_${this.taskId}`;
        const projectPath = path.join(PROJECTS_DIR, projectName);
        fs.mkdirSync(projectPath, { recursive: true });
        log('PROJECT_INIT', `Project directory created: ${projectPath}`);

        for (const [i, block] of blocks.entries()) {
            const ext = this.getFileExtension(block.language);
            const fileName = `${block.language}_${i}.${ext}`;
            const filePath = path.join(projectPath, fileName);
            fs.writeFileSync(filePath, block.code);
            this.saveBlob(projectName, filePath, block.code);
            this.validateCode(filePath, block.language);
            console.log(`\n\x1b[32m[FILE_GEN]\x1b[0m Saved ${block.language} file: \x1b[1m${filePath}\x1b[0m`);
        }
        this.gitCommit(projectName);
    }
    
    getFileExtension(lang) {
        return ({ python: 'py', javascript: 'js', html: 'html', css: 'css', php: 'php', sql: 'sql', bash: 'sh', go: 'go' })[lang] || 'txt';
    }

    validateCode(filePath, language) {
        const commands = {
            python: `python3 -m py_compile ${filePath} 2>&1`,
            php: `php -l ${filePath} 2>&1`,
            javascript: `node -c ${filePath} 2>&1`,
            bash: `bash -n ${filePath} 2>&1`,
            sql: `sqlite3 :memory: ".read ${filePath}" 2>&1` // Basic SQL check
        };
        const cmd = commands[language];
        if (cmd) {
            exec(cmd, (err, stdout, stderr) => {
                if (err || stderr.length > 0) {
                    log('VALIDATION_FAIL', `Validation error for ${path.basename(filePath)}: ${err || stderr}`);
                } else {
                    log('VALIDATION_PASS', `Validation successful for ${path.basename(filePath)}`);
                }
            });
        }
    }
    
    // --- Persistence ---
    saveMemory(prompt, response) {
        const proofState = JSON.stringify(this.proofTracker.getState());
        aiDataDb.run("INSERT INTO memories (task_id, prompt, response, proof_state, ts) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", 
            [this.taskId, prompt, response, proofState]);
    }

    saveBlob(proj, file, content) {
        blobsDb.run("INSERT INTO blobs (project_name, file_path, content, ts) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            [proj, path.basename(file), content]);
    }

    gitCommit(projectName) {
        exec(`git -C ${AI_HOME} add . && git -C ${AI_HOME} commit -m "feat: AI generated project ${projectName}"`, (err, stdout, stderr) => {
            if (err) log('GIT_ERROR', `Failed to commit ${projectName}: ${err || stderr}`);
            else log('GIT_SUCCESS', `Committed project ${projectName}`);
        });
    }

    // --- Main Entry ---
    async execute() {
        log('ORCHESTRATION_START', `Task ${this.taskId} started. Initial prompt: ${this.initialPrompt.substring(0, 50)}...`);
        const finalOutput = await this.recursiveConsensus();
        
        console.log("\n\x1b[1;32m--- Final Consensus Output ---\x1b[0m\n");
        console.log(finalOutput);
        
        this.saveMemory(this.initialPrompt, finalOutput);
        await this.handleCodeGeneration(finalOutput);

        log('ORCHESTRATION_END', `Task ${this.taskId} finished.`);
    }
}

// Main Execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const prompt = args.filter(arg => !arg.startsWith('--')).join(' ');
    const options = {};
    args.filter(arg => arg.startsWith('--')).forEach(arg => {
        const [key, value] = arg.slice(2).split('=');
        options[key] = value || true;
    });
    
    if (!prompt) process.exit(1);

    const orchestrator = new AIOrchestrator(prompt, options);
    orchestrator.execute().finally(() => {
        aiDataDb.close();
        blobsDb.close();
    });
}
EOF_JS

    # 2. Write the Python Manager (Server, Wallet, Seed)
    cat > "$MANAGER_PY" << 'EOF_PY'
import http.server, socketserver, json, sqlite3, os, sys, argparse

try:
    from bip_utils import Bip39SeedGenerator
    BIP_UTILS_AVAILABLE = True
except ImportError:
    BIP_UTILS_AVAILABLE = False

AI_HOME = os.path.expanduser("~/.sysop-ai")
DB_DIR = os.path.join(AI_HOME, "db")
WALLET_DB_PATH = os.path.join(DB_DIR, "wallet.db")

def setup_wallet_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(WALLET_DB_PATH)
    c = conn.cursor()
    c.execute('CREATE TABLE IF NOT EXISTS seeds (id INTEGER PRIMARY KEY, mnemonic TEXT UNIQUE, ts DATETIME DEFAULT CURRENT_TIMESTAMP)')
    c.execute('CREATE TABLE IF NOT EXISTS wallets (id INTEGER PRIMARY KEY, name TEXT UNIQUE, coin_type TEXT, address TEXT, private_key TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP)')
    conn.commit()
    conn.close()

def manage_seed(action):
    if not BIP_UTILS_AVAILABLE:
        print("Error: 'bip-utils' library not found. Please run 'pip install bip-utils'", file=sys.stderr)
        return
    setup_wallet_db()
    conn = sqlite3.connect(WALLET_DB_PATH)
    c = conn.cursor()
    if action == 'generate':
        mnemonic = Bip39SeedGenerator.FromWordsNumber(12).Generate()
        try:
            c.execute("INSERT INTO seeds (mnemonic) VALUES (?)", (mnemonic,))
            conn.commit()
            print(f"Generated and saved new seed: \x1b[32m{mnemonic}\x1b[0m")
        except sqlite3.IntegrityError:
            print("Generated a duplicate seed (highly improbable). Try again.")
    elif action == 'list':
        print("\n--- Stored Seed Phrases ---")
        for row in c.execute("SELECT id, mnemonic, ts FROM seeds"):
            print(f"ID {row[0]} | Date: {row[2]} | Seed: \x1b[33m{row[1]}\x1b[0m")
    conn.close()

def manage_wallet(action, name):
    print(f"Wallet management for action '{action}' and name '{name}' is not fully implemented.")
    print("Use the 'seed' command to manage seed phrases first.")

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "SysOp-AI Server is running"}).encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not Found"}).encode())

def run_server():
    PORT = 8000
    try:
        with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
            print(f"\n\x1b[32m[SERVER]\x1b[0m Serving API at \x1b[1mhttp://localhost:{PORT}\x1b[0m (Press Ctrl+C to stop)")
            httpd.serve_forever()
    except Exception as e:
        print(f"\x1b[31m[ERROR]\x1b[0m Failed to start server: {e}", file=sys.stderr)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SysOp-AI Manager (Python backend)")
    subparsers = parser.add_subparsers(dest='command')
    
    server_parser = subparsers.add_parser('server')
    seed_parser = subparsers.add_parser('seed')
    seed_parser.add_argument('action', choices=['generate', 'list'])
    wallet_parser = subparsers.add_parser('wallet')
    wallet_parser.add_argument('action', choices=['create', 'list'])
    wallet_parser.add_argument('--name', default='default')
    
    args = parser.parse_args()
    
    if args.command == 'server':
        run_server()
    elif args.command == 'seed':
        manage_seed(args.action)
    elif args.command == 'wallet':
        manage_wallet(args.action, args.name)
EOF_PY

    # 3. Initialize Databases
    sqlite3 "$AI_DATA_DB" "CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, task_id TEXT, prompt TEXT, response TEXT, proof_state TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP);" 2>/dev/null
    sqlite3 "$AI_DATA_DB" "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, event_type TEXT, message TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP);" 2>/dev/null
    sqlite3 "$BLOBS_DB" "CREATE TABLE IF NOT EXISTS blobs (id INTEGER PRIMARY KEY, project_name TEXT, file_path TEXT, content BLOB, ts DATETIME DEFAULT CURRENT_TIMESTAMP);" 2>/dev/null
    
    # 4. Initialize Git Repo for autobuild-management
    if [ ! -d "$AI_HOME/.git" ]; then
        git init -b devel "$AI_HOME" &>/dev/null
        log_event "SETUP" "Initialized Git repository in $AI_HOME"
    fi
}

# --- Command Functions ---

# Default action: hash timestamp and list files recursively
default_task() {
    echo -e "\x1b[33mNo command provided. Initializing new hash-instance.\x1b[0m"
    local timestamp=$(date +%s)
    local hash=$(echo -n "$timestamp" | sha256sum | awk '{print $1}')
    echo -e "Hash Instance (SHA256): \x1b[1m$hash\x1b[0m"
    echo "Files in current directory (./* recursive):"
    find . -type f | while IFS= read -r file; do
        echo -e "  \x1b[2m$file\x1b[0m"
    done
}

# Manage SSH Keys
manage_ssh() {
    case "$1" in
        ls)
            echo -e "\n--- Stored SSH Keys in $SSH_DIR ---"
            ls -la "$SSH_DIR"
            ;;
        gen)
            read -p "Enter key name (e.g., id_rsa_project): " key_name
            ssh-keygen -t rsa -b 4096 -f "$SSH_DIR/$key_name" -C "SysOp-AI Generated Key for $key_name"
            log_event "SSH" "Generated new key: $key_name"
            echo -e "\x1b[32mKey generated:\x1b[0m $SSH_DIR/$key_name"
            ;;
        *) echo "Usage: ai.sh ssh-key [ls|gen]" ;;
    esac
}

# Display help message
show_help() {
    echo -e "\x1b[1mSysOp-AI CLI v54\x1b[0m: Local LLM Orchestration & Project Management"
    echo ""
    echo "USAGE:"
    echo "  ai.sh [COMMAND] [ARGUMENTS]"
    echo "  ai.sh <prompt> [--project=<name>]"
    echo ""
    echo "DEFAULT BEHAVIOR:"
    echo "  If no additional parameter is given, inits a new hash-instance on timestamp only"
    echo "  and shows all files+folders from the dir from ./* recursive."
    echo ""
    echo "\x1b[1mCOMMANDS\x1b[0m:"
    echo "  run <prompt>        \x1b[36mExecute AI task loop (with real-time model thinking stream).\x1b[0m"
    echo "  import <url>        Fetch external content for context (automatically runs summary task)."
    echo "  memories            Show past AI prompts/responses."
    echo "  events              Show event logs."
    echo "  blobs               List stored file blobs (content is in DB)."
    echo "  ssh-key [ls|gen]    Manage SSH keys in $SSH_DIR."
    echo "  seed [generate|list] Manage wallet seed phrases (requires 'bip-utils')."
    echo "  wallet [create|list] Wallet CLI (minimal implementation)."
    echo "  server              Start the Python3 web server (http://localhost:8000)."
    echo "  status              Show environment, tools, and model statuses."
    echo ""
    echo "\x1b[1mPROJECT/BUILD FLAGS\x1b[0m:"
    echo "  --start             \x1b[32mBegin new interactive build session (asks for project/repo-name).\x1b[0m"
    echo "  --stop              \x1b[31mStop the current interactive build session.\x1b[0m"
    echo "  --project=<name>    Assign a name to the project for a single 'run' command."
}

# --- Main Execution ---

# Ensure dependencies and environment are set up
check_dependencies
setup_environment

# Process command flags and arguments
PROMPT_ARGS=()
PROJECT_NAME=""
SESSION_PROJECT=$(cat "$SESSION_FILE" 2>/dev/null)

while [ "$#" -gt 0 ]; do
    case "$1" in
        --start)
            read -p "Enter project/repo name: " PROJ_NAME
            echo "$PROJ_NAME" > "$SESSION_FILE"
            log_event "BUILD_SESSION" "Started session for project '$PROJ_NAME'"
            exit 0
            ;;
        --stop)
            rm -f "$SESSION_FILE"
            log_event "BUILD_SESSION" "Stopped session."
            exit 0
            ;;
        --project=*)
            PROJECT_NAME="${1#*=}"
            shift
            ;;
        --force)
            # Placeholder for future logic
            shift
            ;;
        *)
            PROMPT_ARGS+=("$1")
            shift
            ;;
    esac
done

COMMAND="${PROMPT_ARGS[0]}"
[[ -z "$COMMAND" ]] && COMMAND=""
PROMPT="${PROMPT_ARGS[@]:1}"

# Handle default task logic
if [[ -z "$COMMAND" && -z "$PROMPT" ]]; then
    default_task
    exit 0
fi

# Determine the final project flag for the orchestrator
FINAL_PROJECT_FLAG=""
if [[ ! -z "$PROJECT_NAME" ]]; then
    FINAL_PROJECT_FLAG="--project=$PROJECT_NAME"
elif [[ ! -z "$SESSION_PROJECT" ]]; then
    FINAL_PROJECT_FLAG="--project=$SESSION_PROJECT"
fi

case "$COMMAND" in
    run)
        FULL_PROMPT="$PROMPT"
        log_event "TASK_START" "Prompt: $FULL_PROMPT"
        # Pass the full prompt and project flag to the Node.js orchestrator
        node "$ORCHESTRATOR_JS" "$FULL_PROMPT" "$FINAL_PROJECT_FLAG"
        log_event "TASK_END" "Task finished."
        ;;
    import)
        URL="$PROMPT"
        log_event "IMPORT" "Fetching content from $URL"
        CONTENT=$(curl -sL "$URL")
        
        # Immediately run a task to summarize the imported content
        IMPORT_PROMPT="Analyze and summarize the following content, then suggest the next development steps: $CONTENT"
        echo -e "\n\x1b[33m[AI_CONTEXT]\x1b[0m Context fetched. Running AI to summarize and integrate context..."
        log_event "TASK_START" "Prompt: $IMPORT_PROMPT"
        node "$ORCHESTRATOR_JS" "$IMPORT_PROMPT" "$FINAL_PROJECT_FLAG"
        log_event "TASK_END" "Import and Context-Task finished."
        ;;
    memories) 
        echo -e "\n--- AI Memories (Prompt | Timestamp) ---"
        sqlite3 -header -column "$AI_DATA_DB" "SELECT id, substr(prompt, 1, 60) as prompt_summary, substr(proof_state, 1, 30) as proof_summary, ts FROM memories ORDER BY ts DESC;"
        ;;
    events) 
        echo -e "\n--- AI Event Log ---"
        sqlite3 -header -column "$AI_DATA_DB" "SELECT * FROM events ORDER BY ts DESC LIMIT 20;"
        ;;
    blobs) 
        echo -e "\n--- AI Generated File Blobs ---"
        sqlite3 -header -column "$BLOBS_DB" "SELECT id, project_name, file_path, length(content) as size_bytes, ts FROM blobs ORDER BY ts DESC;"
        ;;
    ssh-key) manage_ssh "$PROMPT" ;;
    seed) python3 "$MANAGER_PY" seed "$PROMPT" ;;
    wallet) python3 "$MANAGER_PY" wallet "$PROMPT" ;;
    server) python3 "$MANAGER_PY" server & ;;
    status)
        echo -e "\n\x1b[1mSysOp-AI Environment Status\x1b[0m"
        echo -e "  \x1b[36mRoot Dir:\x1b[0m $AI_HOME"
        echo -e "  \x1b[36mOllama:\x1b[0m $(command -v $OLLAMA_BIN &> /dev/null && echo 'OK' || echo 'Not Found')"
        echo -e "  \x1b[36mNodeJS:\x1b[0m $(command -v node &> /dev/null && echo 'OK' || echo 'Not Found')"
        echo -e "  \x1b[36mPython3:\x1b[0m $(command -v python3 &> /dev/null && echo 'OK' || echo 'Not Found')"
        [ -f "$SESSION_FILE" ] && echo -e "  \x1b[36mActive Session:\x1b[0m \x1b[32m$(cat "$SESSION_FILE")\x1b[0m"
        ;;
    --help|-h) show_help ;;
    *) # Fallback: Treat as a run command if not recognized
        FULL_PROMPT="${PROMPT_ARGS[@]}"
        log_event "TASK_START" "Prompt: $FULL_PROMPT"
        node "$ORCHESTRATOR_JS" "$FULL_PROMPT" "$FINAL_PROJECT_FLAG"
        log_event "TASK_END" "Task finished."
        ;;
esac

