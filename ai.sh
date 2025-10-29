#!/bin/bash
# Autonomic Synthesis Platform (ASP) - Editor Back-end Logic
# Multi-model reasoning framework with parallel execution and memory
# Version 4.1.0 - Dedicated Web-Editor/API Backend Refinement Logic
#
# NEW: Adds a specialized 'ai process-editor' command to handle JSON payloads 
# from the Nemodian 2244-1 AI Code Editor.

set -euo pipefail

#--- Core Configuration: The Agent Manifest (Holistic Verbosity Focus) ---
VERSION="4.1.0"
AUTHOR="Nemodian 2244-1"

# Agent Manifest: Defines the 5 core reasoning agents and their specializations.
declare -A AGENT_MANIFEST=(
    ["code"]="ALGORITHMICAL: Provide expressive, fully detailed analysis with comprehensive code examples and deep technical background."
    ["coin"]="BIOLOGICAL: Offer extensive, emotionally and contextually rich analysis, detailing mood shifts and historical significance."
    ["2244"]="CHEMICAL: Deliver exhaustive multilingual responses, deeply exploring cultural and linguistic nuances in both German and English."
    ["core"]="PHYSICAL: Present an in-depth, structured decomposition of the problem, detailing every logical step and counter-argument considered."
    ["loop"]="LOGICAL: Generate lengthy, refined answers that fully articulate the synthesis process and justify every decision through exhaustive feedback integration."
)

# Database paths (The Collective Memory)
DB_DIR="${HOME}/_/.ai_platform"
CORE_DB="${DB_DIR}/core.db"
SWAP_DIR="${DB_DIR}/swap"
LOG_FILE="${DB_DIR}/ai.log"
mkdir -p "$DB_DIR" "$SWAP_DIR"

# OLLAMA configuration (The Inference Engine)
OLLAMA_BASE="http://localhost:11434"
DEFAULT_MODEL="deepseek-v3.1:671b-cloud"

# Genesis Hash Storage (Stores the successful convergence hash for future learning)
GENESIS_HASH_FILE="${DB_DIR}/genesis.hash"

# --- Utility Functions (Omitted for brevity in this output) ---
log_event(){ local level="$1" local message="$2" local timestamp=$(date '+%Y-%m-%d %H:%M:%S') echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE" }
hash_string(){ echo -n "$1" | sha256sum | cut -d ' ' -f1 }
hash_file(){ if [[ -f "$1" ]]; then sha256sum "$1" | cut -d ' ' -f1; else echo "File not found: $1" >& 2; return 1; fi }
hash_directory(){ local dir="$1"; find "$dir" -type f -exec sha256sum {} + 2>/dev/null | sort -k2 | sha256sum | cut -d ' ' -f1; }
cleanup_swap_dir(){ local days="${1:-30}"; log_event "INFO" "Cleaning up swap directory older than $days days..."; find "$SWAP_DIR" -type f -mtime +"$days" -exec rm -f {} \; 2>/dev/null; }
compress_store(){ local content="$1" local hash=$(hash_string "$content") local swap_file="${SWAP_DIR}/${hash}.gz"; echo "$content" | gzip -c > "$swap_file"; echo "$hash"; }
retrieve_swap(){ local hash="$1" local swap_file="${SWAP_DIR}/${hash}.gz"; if [[ -f "$swap_file" ]]; then zcat "$swap_file" 2>/dev/null; else return 1; fi }
get_mood_context(){ local hour=$(date +%H) local mood="" case "$hour" in 06|07|08|09|10|11) mood="morning_fresh";; 12|13|14|15|16|17) mood="day_productive";; 18|19|20|21|22) mood="evening_reflective";; *) mood="night_creative";; esac local emotions=("focused" "curious" "analytical" "creative" "empathetic") local random_emotion="${emotions[$RANDOM % ${#emotions[@]}]}"; echo "${mood}_${random_emotion}" }
get_time_context(){ local timestamp=$(date '+%Y-%m-%d %H:%M:%S') local day_of_week=$(date '+%A'); echo "${day_of_week}_${timestamp}" }
detect_preferred_language(){ local prompt="$1"; if [[ "$prompt" =~ [äöüÄÖÜß] ]]; then echo "German"; elif [[ "$prompt" =~ [a-zA-Z] ]]; then echo "English"; else echo "English"; fi }
assemble_prompt(){ local prompt="$1" local context="$2" local model_type="$3"; cat <<EOF
Original Prompt: $prompt
Context from previous iterations: $context
Model Role: ${AGENT_MANIFEST[$model_type]}
Please provide your analysis and reasoning.
If you reach a definitive conclusion, mark it with [FINAL_ANSWER].
EOF
}
generate_fallback_response(){ local prompt="$1" local model_type="$2" local fallback_msg=""; case "$model_type" in "code") fallback_msg="Technical analysis: Code Agent offline. The problem requires a systematic approach to algorithm design.";; "coin") fallback_msg="Contextual analysis: Current systems offline. In such moments, reflection often reveals alternative perspectives worth exploring.";; "2244") fallback_msg="Sprachanalyse derzeit nicht verfügbar. Fallback: Die Fragestellung erfordert weitere Betrachtung aus verschiedenen Blickwinkeln.";; "core") fallback_msg="Core reasoning temporarily unavailable. Logical fallback: decompose problem into smaller subproblems and address each systematically.";; "loop") fallback_msg="Iterative synthesis paused. Consider previous outputs and identify convergence patterns for optimal solution integration.";; *) fallback_msg="Analysis unavailable. Please try again when AI systems are fully operational.";; esac; echo "[FALLBACK]$fallback_msg" }
get_genesis_hash(){ if [[ -f "$GENESIS_HASH_FILE" ]]; then cat "$GENESIS_HASH_FILE"; else hash_file "$0"; fi }
store_genesis_hash(){ local successful_hash="$1"; echo "$successful_hash" > "$GENESIS_HASH_FILE"; log_event "SUCCESS" "New Common Origin Hash (Origin-H) stored: ${successful_hash:0:10}..." }
sqlite3_escape(){ local str="$1"; echo "$str" | sed "s/'/''/g"; }

#--- Unrestricted File/CRUD Operations (For ai crud, rest, soap) ---
file_create(){ local path="$1" local content="${2:-}"; log_event "SECURITY" "ATTENTION: Creating file at unrestricted path: $path"; echo -n "$content" > "$path" || return 1; echo "File created/overwritten at $path."; }
file_read(){ local path="$1"; log_event "SECURITY" "ATTENTION: Reading file from unrestricted path: $path"; if [[ -f "$path" ]]; then cat "$path"; else echo "Error: File not found at $path" >&2; return 1; fi }
file_update(){ local path="$1" local content="$2"; log_event "SECURITY" "ATTENTION: Appending content to unrestricted path: $path"; echo "$content" >> "$path" || return 1; echo "Content appended to $path."; }
file_delete(){ local path="$1"; log_event "SECURITY" "ATTENTION: Deleting file from unrestricted path: $path"; if [[ -f "$path" ]]; then rm "$path" || return 1; echo "File deleted at $path."; else echo "Error: File not found at $path" >&2; return 1; fi }
ai_rest_sim(){ local action="$1" local path="$2" local data="$3"; log_event "INFO" "Simulating REST $action on $path"; case "$action" in "GET") file_read "$path";; "POST") file_create "$path" "$data";; "PUT") file_create "$path" "$data";; "DELETE") file_delete "$path";; *) echo "Error: Invalid REST action: $action" >&2; return 1;; esac }
ai_soap_sim(){ local method="$1" local endpoint="$2" local xml_body="$3"; log_event "INFO" "Simulating SOAP $method on $endpoint"; echo "SOAP Simulation for Method: $method"; echo "Endpoint: $endpoint"; echo "Request Body:"; echo "$xml_body" | head -n 5; if [[ "$method" == "GetData" ]]; then echo "<soap:Envelope><soap:Body><ns:GetDataResponse><ns:Result>Simulated SOAP Data</ns:Result></ns:GetDataResponse></soap:Body></soap:Envelope>"; else echo "<soap:Envelope><soap:Body><ns:Result>Simulated SOAP Success</ns:Result></soap:Body></soap:Envelope>"; fi }


#--- NEW: AI Editor API Processing Logic ---
# Handles JSON payload from the web client. Input is piped to stdin.
ai_process_editor(){
    local json_input
    # Read the entire piped JSON payload from stdin
    json_input=$(cat /dev/stdin)
    
    # Extract data using jq
    local prompt
    local code_context
    
    prompt=$(echo "$json_input" | jq -r '.prompt // ""')
    code_context=$(echo "$json_input" | jq -r '.context // ""')
    
    if [[ -z "$prompt" ]]; then
        echo '{"error": "Missing prompt in payload."}'
        return 1
    fi

    log_event "API" "Processing Editor Payload. Prompt: ${prompt:0:50}..."

    # Check if this is a Code Refinement request (based on common editor/refine prompts)
    if [[ "$prompt" == *"[FINAL_ANSWER]CODE_START"* ]] || [[ "$prompt" == *fix\ the\ syntax\ error* ]] || [[ "$prompt" == *Critique\ and\ fix* ]]; then
        # This is a refinement task. Set the full context as the problem to be solved.
        local full_refine_prompt="${prompt}\n\nCODE TO BE REFINED:\n\n---\n${code_context}"
        
        local result
        result=$(autonomic_reasoning "$full_refine_prompt")
        
        local suggested_code=$(echo "$result" | sed -n '/\[FINAL_ANSWER\]CODE_START/,/CODE_END/p')
        local clean_code=$(echo "$suggested_code" | sed -e '1d' -e '$d' -e 's/\[FINAL_ANSWER\]CODE_START//' -e 's/CODE_END//')
        
        # Output JSON response for the web editor
        echo "{\"suggested_code\": $(jq -Rs . <<< "$clean_code"), \"analysis_output\": $(jq -Rs . <<< "$result")}"
        
    else
        # This is a general synthesis/reasoning request
        local result
        result=$(autonomic_reasoning "$prompt")
        
        # Output JSON response for the web editor
        echo "{\"final_output\": $(jq -Rs . <<< "$result")}"
    fi
}


#--- Agent Execution, Scoring, Fusion logic remains the same (omitted for output brevity) ---
# ...
#--- Main Reasoning Loop (Enhanced for Verbosity) ---
autonomic_reasoning(){ local prompt="$1" local max_loops=5 local prompt_hash=$(hash_string "$prompt"); local current_genesis_hash=$(get_genesis_hash); local initial_context="System Origin Hash (Origin-H): ${current_genesis_hash:0:10}..." log_event "INFO" "Starting 5-Agent Assembly for prompt: ${prompt:0:50}..." local context="${initial_context}" local final_answer_detected=false local final_output_hash=""; for ((loop = 1; loop <= max_loops; loop++)); do echo -e "\n🔄 ASP Cycle $loop/$max_loops (Origin-H: ${current_genesis_hash:0:10}...)" echo "========================================"; if [[ $loop -eq 1 ]]; then local cached=$(check_cached_response "$prompt_hash"); if [[ -n "$cached" ]]; then echo "📚 Using cached reasoning results from Collective Memory"; echo "$cached"; return 0; fi; fi; declare -A model_outputs; execute_model_race "$prompt" "$context" model_outputs; for model in "${!model_outputs[@]}"; do echo -e "\n🧠 Agent ${model^^}: ${AGENT_MANIFEST[$model]}"; echo "----------------------------------------"; local display_output="${model_outputs[$model]#[FALLBACK]}"; echo "${display_output:0:200}..."; done; local fused_output=$(rank_and_fuse_outputs model_outputs "$loop" "$prompt_hash"); context=$(build_context model_outputs "$loop"); local display_fused_output="${fused_output#[FALLBACK]}"; echo -e "\n💡 Orchestrator Consensus (Cycle $loop):"; echo "----------------------------------------"; echo "${display_fused_output:0:500}..."; if [[ "$fused_output" == *"[FINAL_ANSWER]"* ]]; then final_answer_detected=true; final_output_hash=$(hash_string "$fused_output"); echo -e "\n🎯 Final Answer Protocol detected!"; break; fi; if [[ $(echo "$fused_output" | wc -w) -lt 300 ]] && [[ $loop -lt $max_loops ]]; then echo -e "\n📈 Output is not yet exhaustive (word count < 300), extending max cycles..."; ((max_loops++)); fi; done; local final_output="${fused_output#[FALLBACK]}"; if [[ "$final_answer_detected" = true ]]; then store_genesis_hash "$final_output_hash"; fi; store_task_log "reasoning" "$prompt" "$final_output" "loops=$loop,final=$final_answer_detected"; echo -e "\n✅ Autonomic Synthesis Complete"; echo "========================================"; echo "$final_output" }
check_cached_response(){ local prompt_hash="$1"; sqlite3 "$CORE_DB" <<-'EOF'
SELECT output_text FROM mindflow WHERE prompt_hash = '$prompt_hash' ORDER BY loop_number DESC,ranking_score DESC LIMIT 1;
EOF
}
build_context(){ local -n outputs="$1" local loop_number="$2" local context="Previous loop $loop_number outputs (Full Verbose Context):\n"; for model in "${!outputs[@]}"; do local output="${outputs[$model]}" local clean_output="${output#[FALLBACK]}"; context="${context}\n${model^^}: ${clean_output:0:300}..."; done; echo -e "$context" }
store_task_log(){ local task_type="$1" local input="$2" local output="$3" local metadata="$4"; if [[ ${#output} -gt 2000 ]]; then local compressed_hash=$(compress_store "$output"); output="COMPRESSED:$compressed_hash"; fi; sqlite3 "$CORE_DB" <<'EOF'
INSERT INTO task_logs(task_type,task_input,task_output,metadata)
VALUES('$task_type','$(sqlite3_escape "$input")','$(sqlite3_escape "$output")','$(sqlite3_escape "$metadata")');
EOF
}
ai_refine_file(){ local file="$1"; if [[ ! -f "$file" ]]; then echo "Error: File not found: $file" >&2; return 1; fi; local file_content=$(cat "$file") local file_type=$(file -b --mime-type "$file") local prompt="Analyze the following ${file_type} content from file '$file'. Provide a fully detailed critique focusing on best practices, efficiency, and robustness. Present the suggested, improved code block marked with [FINAL_ANSWER]CODE_START...CODE_END. Original Content:\n\n---\n\n${file_content}"; echo -e "💡 Starting Autonomous Code Refinement on $file (using CORE/CODE agents)..."; log_event "INFO" "Refining code file: $file"; local result=$(autonomic_reasoning "$prompt"); echo -e "\n========================================"; echo -e "✅ Refinement Analysis Complete"; echo -e "========================================"; local suggested_code=$(echo "$result" | sed -n '/\[FINAL_ANSWER\]CODE_START/,/CODE_END/p'); if [[ -n "$suggested_code" ]]; then echo -e "\nSuggested Refinement:"; echo -e "----------------------------------------"; echo "$suggested_code" | sed -e '1d' -e '$d' -e 's/\[FINAL_ANSWER\]CODE_START//' -e 's/CODE_END//'; else echo -e "\nFull Analysis Output:"; echo -e "----------------------------------------"; echo "$result"; fi }
ai_synthesize_topic(){ local topic="$1"; if [[ -z "$topic" ]]; then echo "Error: Please specify a topic for synthesis." >&2; return 1; } local prompt="Perform an exhaustive, holistic synthesis on the topic: '$topic'. Ensure the final response is deeply contextual, culturally aware (incorporate a German perspective), and logically robust. Provide the full synthesized report marked with [FINAL_ANSWER]."; echo -e "💡 Starting Contextual Topic Synthesis on '$topic' (using CORE/COIN/2244 agents)..."; log_event "INFO" "Synthesizing topic: $topic"; local result=$(autonomic_reasoning "$prompt"); echo -e "\n========================================"; echo -e "✅ Synthesis Report Complete"; echo -e "========================================"; echo "$result" | sed 's/\[FINAL_ANSWER\]//g'; }
ai_editor_file(){ local file="$1"; if [[ -z "$file" ]]; then echo "Error: Please specify a file to edit." >&2; return 1; } if [[ ! -f "$file" ]]; then echo "Warning: File '$file' does not exist. Creating it."; fi; log_event "INFO" "Opening '$file' with editor..."; "${EDITOR:-vi}" "$file"; }
download_and_unzip(){ local url="$1" local destination="${2:-./}" log_event "INFO" "Downloading: $url"; local temp_file=$(mktemp); if curl -L -s "$url" -o "$temp_file"; then if file "$temp_file" | grep -q "Zip archive"; then unzip -q "$temp_file" -d "$destination"; log_event "SUCCESS" "Downloaded and extracted to $destination"; else mv "$temp_file" "$destination"; log_event "SUCCESS" "Downloaded to "$destination""; fi; else log_event "ERROR" "Download failed: $url"; return 1; fi }
file_search(){ local pattern="$1" local path="${2:-.}" log_event "INFO" "Searching for: $pattern in $path"; if command -v rg >/dev/null 2>&1; then rg --color=always -n "$pattern" "$path"; else grep -r --color=always -n "$pattern" "$path" 2>/dev/null || true; fi }
lint_code(){ local file="$1" local linter="${2:-auto}"; if [[ "$linter" == "auto" ]]; then case "$file" in *.js|*.ts)linter="eslint";; *.py)linter="pylint";; *.sh)linter="shellcheck";; *)echo "No linter configured for $file" && return 1;; esac; fi; case "$linter" in "eslint")npx eslint "$file";; "pylint")pylint "$file";; "shellcheck")shellcheck "$file";; *)echo "Unknown linter: $linter" && return 1;; esac }


#--- Main CLI Interface (Updated Help) ---
show_help(){
cat <<-'EOF'
Autonomic Intelligence Platform v$VERSION - 5-Agent Assembly (Data Service)

USAGE:
ai "prompt"                 # Execute the full 5-Agent parallel reasoning pipeline
ai process-editor           # PROCESS: Read JSON payload from STDIN (API/Web Editor Backend)
ai crud <action> <path> [data] # Direct File CRUD (DANGER: Unrestricted access!)
ai rest <action> <path> [data] # Simulates REST CRUD (GET, POST, PUT, DELETE)
ai soap <method> <endpoint> [xml] # Simulates SOAP call
ai logs                     # Show recent activity logs
ai status                   # Show system status
# ... (Other commands omitted for brevity)

EOF
}
show_status(){
    echo "🤖 Autonomic Intelligence Platform Status"
    echo "========================================"
    echo "Version: $VERSION"
    echo "Database: $CORE_DB"
    echo "Swap Directory: $SWAP_DIR"
    echo "Log File: $LOG_FILE"
    
    if curl -s "${OLLAMA_BASE}/api/tags" >/dev/null; then
        echo "OLLAMA: ✅ Connected"
    else
        echo "OLLAMA: ❌ Offline (using fallbacks)"
    fi
    
    local mindflow_count=$(sqlite3 "$CORE_DB" "SELECT COUNT(*) FROM mindflow;" 2>/dev/null || echo "0")
    local task_count=$(sqlite3 "$CORE_DB" "SELECT COUNT(*) FROM task_logs;" 2>/dev/null || echo "0")
    echo "Mindflow Records: $mindflow_count"
    echo "Task Logs: $task_count"
    echo "Active Models: ${#AGENT_MANIFEST[@]}"
}
show_logs(){
    local limit="${1:-10}"
    echo "📋 Recent Activity Logs"
    echo "========================================"
    if [[ -f "$LOG_FILE" ]]; then
        tail -n "$limit" "$LOG_FILE"
    else
        echo "No logs found."
    fi
}

#--- Main Execution ---
main(){
    # Ensure database is initialized
    if [[ ! -f "$CORE_DB" ]]; then
        init_database
        log_event "SYSTEM" "Database initialized at $CORE_DB"
    fi
    
    cleanup_swap_dir 30
    
    case "${1:-}" in
        "process-editor")
            ai_process_editor
            ;;
        "crud")
            log_event "SECURITY" "WARNING: Running Unrestricted CRUD. Input arguments must be sanitized."
            case "$2" in
                "create") file_create "$3" "$4";;
                "read") file_read "$3";;
                "update") file_update "$3" "$4";;
                "delete") file_delete "$3";;
                *) echo "Error: Invalid CRUD action. Use: create, read, update, delete" >&2; return 1;;
            esac
            ;;
        "rest")
            ai_rest_sim "$2" "$3" "$4";;
        "soap")
            ai_soap_sim "$2" "$3" "$4";;
        "hash")
            if [[ -f "$2" ]]; then hash_file "$2"; else hash_string "${2:-}"; fi;;
        "download")download_and_unzip "$2" "${3:-}";;
        "search")file_search "$2" "${3:-}";;
        "lint")lint_code "$2" "${3:-auto}";;
        "edit")ai_editor_file "$2";;
        "refine")ai_refine_file "$2";;
        "synthesize")ai_synthesize_topic "$2";;
        "logs")show_logs "$2";;
        "status")show_status;;
        "--help"|"-h"|"help")show_help;;
        "")show_help;;
        *)
        autonomic_reasoning "$*";;
    esac
}

check_dependencies(){
    local deps=("sqlite3" "curl" "jq" "gzip" "file" "shellcheck") 
    local missing=()
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" >/dev/null 2>&1; then
            missing+=("$dep")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Missing dependencies: ${missing[*]}" >&2
        echo "Please install them to use the AI platform." >&2
        exit 1
    fi
}

check_dependencies
main "$@"
