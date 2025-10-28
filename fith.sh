#!/bin/bash
# AI Code Editor & 5-Agent Autonomic Platform v2.1
# Features: Multi-turn coding, streaming suggestions, memory, fused agent outputs, inline patches
set -euo pipefail

VERSION="2.1.0"
AUTHOR="Autonomic Synthesis Platform"

# Paths & DB
DB_DIR="${HOME}/.ai_platform"
CORE_DB="${DB_DIR}/core.db"
SWAP_DIR="${DB_DIR}/swap"
LOG_FILE="${DB_DIR}/ai.log"
OLLAMA_BASE="http://localhost:11434"
DEFAULT_MODEL="deepseek-v3.1:671b-cloud"
mkdir -p "$DB_DIR" "$SWAP_DIR"

# Agent Manifest
declare -A AGENT_MANIFEST=(
  ["code"]="TECHNICAL: algorithms, programming, data structures"
  ["coin"]="CONTEXTUAL: mood, time, history, emotional intelligence"
  ["2244"]="CULTURAL: language priority, multilingual context"
  ["core"]="LOGICAL: reasoning, decomposition, structured analysis"
  ["loop"]="SYNTHESIS: iterative improvement, feedback integration"
)

# Utilities
log_event(){ local level="$1"; local message="$2"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"; }
hash_string(){ echo -n "$1" | sha256sum | cut -d ' ' -f1; }
sqlite3_escape(){ local str="$1"; echo "$str" | sed "s/'/''/g"; }
compress_store(){ local content="$1"; local hash=$(hash_string "$content"); echo "$content" | gzip -c > "$SWAP_DIR/$hash.gz"; echo "$hash"; }
retrieve_swap(){ local hash="$1"; zcat "$SWAP_DIR/$hash.gz" 2>/dev/null || return 1; }

# Database
init_database(){
  sqlite3 "$CORE_DB" <<'EOF'
CREATE TABLE IF NOT EXISTS mindflow(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    prompt_hash TEXT,
    loop_number INTEGER,
    model_name TEXT,
    output_text TEXT,
    ranking_score REAL,
    language TEXT,
    mood_context TEXT
);
CREATE TABLE IF NOT EXISTS task_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    task_type TEXT,
    task_input TEXT,
    task_output TEXT,
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_mindflow_hash ON mindflow(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_mindflow_loop ON mindflow(loop_number);
EOF
}

# Agent Calls
call_ollama_model(){
  local system_msg="$1" prompt="$2" context="$3" model_type="$4"
  local full_prompt="Original Prompt: $prompt
Context:\n$context
Model Role: ${AGENT_MANIFEST[$model_type]}
Provide analysis. Mark final answer with [FINAL_ANSWER] if ready."
  if ! curl -s "${OLLAMA_BASE}/api/tags" >/dev/null; then
    echo "[FALLBACK] ${model_type} agent offline"; return 0
  fi
  local response
  response=$(curl -s -X POST "${OLLAMA_BASE}/api/generate" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg model "$DEFAULT_MODEL" --arg system "$system_msg" --arg prompt "$full_prompt" \
         '{model:$model,system:$system,prompt:$prompt,stream:false,options:{temperature:0.7,top_p:0.9,top_k:40}}')" 2>/dev/null || echo '{"response":"API_ERROR"}')
  echo "$response" | jq -r '.response' 2>/dev/null || echo "[FALLBACK] ${model_type} failed"
}

run_agent_code(){ call_ollama_model "TECHNICAL reasoning agent" "$1" "$2" "code"; }
run_agent_coin(){ call_ollama_model "CONTEXTUAL agent" "$1" "$2" "coin"; }
run_agent_2244(){ call_ollama_model "CULTURAL agent" "$1" "$2" "2244"; }
run_agent_core(){ call_ollama_model "LOGICAL reasoning agent" "$1" "$2" "core"; }
run_agent_loop(){ call_ollama_model "SYNTHESIS agent" "$1" "$2" "loop"; }

# Dialog Context
build_context_dialog(){
  local prompt_hash="$1" context=""
  mapfile -t past_outputs < <(sqlite3 "$CORE_DB" \
    "SELECT loop_number, model_name, output_text FROM mindflow WHERE prompt_hash='$prompt_hash' ORDER BY loop_number, model_name;")
  for line in "${past_outputs[@]}"; do
    local loop model output
    loop=$(echo "$line" | awk -F'|' '{print $1}')
    model=$(echo "$line" | awk -F'|' '{print $2}')
    output=$(echo "$line" | awk -F'|' '{print $3}')
    output="${output#[FALLBACK]}"
    context+="[Loop $loop][$model]: ${output:0:200}...\n"
  done
  echo -e "$context"
}

# Parallel Execution
execute_model_dialog(){
  local prompt="$1" context="$2" local -n results_array="$3"
  declare -A tmp_files pids
  for model in "${!AGENT_MANIFEST[@]}"; do
    local tmp=$(mktemp)
    tmp_files["$model"]="$tmp"
    {
      case "$model" in
        code) run_agent_code "$prompt" "$context";;
        coin) run_agent_coin "$prompt" "$context";;
        2244) run_agent_2244 "$prompt" "$context";;
        core) run_agent_core "$prompt" "$context";;
        loop) run_agent_loop "$prompt" "$context";;
      esac
    } | while IFS= read -r line; do
      echo -e "\e[1;34m[$model]\e[0m $line"
      echo "$line" >> "${tmp_files[$model]}"
    done &
    pids["$model"]=$!
  done
  for model in "${!pids[@]}"; do
    wait "${pids[$model]}"
    results_array["$model"]="$(< "${tmp_files[$model]}")"
    rm -f "${tmp_files[$model]}"
  done
}

# FPI Scoring & Fusion
calculate_output_score(){
  local output="$1" model="$2" score=0
  local length
  length=$(echo "$output" | wc -w)
  score=$((score + length*10))
  [[ "$output" == *"[FINAL_ANSWER]"* ]] && score=$((score + 5000))
  case "$model" in code) score=$((score+1000));; core) score=$((score+1500));; loop) score=$((score+1200));; *) score=$((score+800));; esac
  [[ "$output" == *"[FALLBACK]"* ]] && score=$((score-10000))
  echo "$score"
}

fuse_weighted_outputs(){
  local -n outputs="$1" weights="$2"
  local best_model="" best_score=-1
  for model in "${!weights[@]}"; do
    (( weights[$model] > best_score )) && best_score=${weights[$model]} && best_model=$model
  done
  echo "${outputs[$best_model]}"
}

rank_and_fuse_outputs(){
  local -n model_outputs="$1" loop_number="$2" prompt_hash="$3"
  declare -A scores rankings
  for model in "${!model_outputs[@]}"; do
    scores["$model"]=$(calculate_output_score "${model_outputs[$model]}" "$model")
  done
  local sorted_models
  sorted_models=$(for model in "${!scores[@]}"; do echo "${scores[$model]} $model"; done | sort -rn | awk '{print $2}')
  local rank=1
  for model in $sorted_models; do rankings["$model"]=$rank; ((rank++)); done
  for model in "${!model_outputs[@]}"; do
    store_model_output "$prompt_hash" "$loop_number" "$model" "${model_outputs[$model]}" "${scores[$model]}" "${rankings[$model]}"
  done
  fuse_weighted_outputs model_outputs scores
}

store_model_output(){
  local prompt_hash="$1" loop_number="$2" model_name="$3" output_text="$4" ranking_score="$5" ranking="$6"
  sqlite3 "$CORE_DB" <<EOF
INSERT INTO mindflow(prompt_hash, loop_number, model_name, output_text, ranking_score, language, mood_context)
VALUES('$prompt_hash',$loop_number,'$model_name','$(sqlite3_escape "$output_text")','$ranking_score','English','default');
EOF
}

#--- Patch Handling ---
ai_patch_run(){
  local file="$1" prompt="$2"
  [[ ! -f "$file" ]] && { echo "File not found: $file"; return 1; }
  local content prompt_hash ai_output tmp_orig tmp_suggest
  content=$(<"$file")
  prompt_hash=$(hash_string "$file-$prompt")
  declare -A model_outputs
  execute_model_dialog "$content\n$prompt" "$(build_context_dialog "$prompt_hash")" model_outputs
  ai_output=$(rank_and_fuse_outputs model_outputs 1 "$prompt_hash")
  tmp_orig=$(mktemp)
  tmp_suggest=$(mktemp)
  echo "$content" > "$tmp_orig"
  echo "$ai_output" > "$tmp_suggest"
  echo -e "\n--- Suggested Patch for $file ---"
  diff -u "$tmp_orig" "$tmp_suggest" || true
  cp "$tmp_suggest" "$SWAP_DIR/last_patch.gz"
  echo "$file" > "$SWAP_DIR/last_file"
  echo "Run 'ai do' to apply this patch"
}

ai_patch_apply(){
  local patch_file="$SWAP_DIR/last_patch.gz"
  local target_file
  [[ ! -f "$patch_file" ]] && { echo "No patch to apply."; return 1; }
  target_file=$(<"$SWAP_DIR/last_file")
  zcat "$patch_file" > "$target_file"
  echo "Patch applied to $target_file"
}

#--- Autonomic Dialog Only ---
autonomic_dialog(){
  local prompt="$1" max_loops=5 prompt_hash=$(hash_string "$prompt") final_answer_detected=false
  local context=""
  for ((loop=1; loop<=max_loops; loop++)); do
    echo -e "\n🔄 Dialog Cycle $loop/$max_loops"
    context=$(build_context_dialog "$prompt_hash")
    declare -A model_outputs
    execute_model_dialog "$prompt" "$context" model_outputs
    local fused_output
    fused_output=$(rank_and_fuse_outputs model_outputs "$loop" "$prompt_hash")
    echo -e "\n💡 Orchestrator Consensus (Cycle $loop):"
    echo "${fused_output#[FALLBACK]:0:300}..."
    [[ "$fused_output" == *"[FINAL_ANSWER]"* ]] && { final_answer_detected=true; break; }
  done
  echo -e "\n✅ Dialog Complete"
  echo "$fused_output"
}

#--- CLI Interface ---
main(){
  [[ ! -f "$CORE_DB" ]] && init_database
  case "${1:-}" in
    run) ai_patch_run "$2" "$3";;
    do) ai_patch_apply;;
    "") show_help;;
    *) autonomic_dialog "$*";;
  esac
}

show_help(){
cat <<EOF
AI Code Editor & 5-Agent Platform v$VERSION

Usage:
  ai run <file_path> "prompt"    # Generate AI patch suggestion for file
  ai do                          # Apply last AI-generated patch
  ai "prompt"                    # Run autonomic 5-agent dialog on a prompt

Examples:
  ai run script.py "Refactor the main function"
  ai do
  ai "Explain quantum computing in simple terms"

Agents (5-Agent Assembly):
  code   - Technical reasoning and programming
  coin   - Context-aware reasoning, emotional intelligence
  2244   - Language prioritization, cultural context
  core   - Core logical reasoning and decomposition
  loop   - Iterative improvement and synthesis

EOF
}

# Dependency check
check_dependencies(){
  local deps=("sqlite3" "curl" "jq" "gzip" "diff")
  local missing=()
  for dep in "${deps[@]}"; do
    ! command -v "$dep" >/dev/null && missing+=("$dep")
  done
  [[ ${#missing[@]} -gt 0 ]] && { echo "Missing dependencies: ${missing[*]}"; exit 1; }
}

# Run
check_dependencies
main "$@"
