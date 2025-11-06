import json
import hashlib
import time
import math
import random
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- CONFIGURATION ---
OLLAMA_URL = 'http://localhost:11434/api/generate'
OLLAMA_MODELS = [
    'gemma:latest',
    'deepseek-coder:latest',
    'gemma:latest',
    'deepseek-coder:latest',
    'gemma:latest'
]
# Ensure Ollama is running and accessible before starting the server.
# --- END CONFIGURATION ---

app = Flask(__name__)
# Enable CORS for the client running on a different port/origin (e.g., the browser file:// or a different local host).
CORS(app) 
ollama_model_index = 0

# --- UTILITY FUNCTIONS (Server-Side Implementation) ---

def sha256(data):
    """Calculates the SHA-256 hash of a string."""
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()

def calculate_entropy(hash_string):
    """Calculates the Shannon entropy of a hash string."""
    char_counts = {}
    for char in hash_string:
        char_counts[char] = char_counts.get(char, 0) + 1
    
    entropy = 0
    length = len(hash_string)
    for count in char_counts.values():
        probability = count / length
        entropy -= probability * math.log2(probability)
    return round(entropy, 3)

def get_next_model():
    """Cycles through the defined Ollama models."""
    global ollama_model_index
    model = OLLAMA_MODELS[ollama_model_index % len(OLLAMA_MODELS)]
    ollama_model_index += 1
    return model

# --- AGENT AND ORCHESTRATION LOGIC ---

def perform_fractal_reasoning(agent_id, model, prompt, context, round_num, origin, file_type, reasoning_depth):
    """
    Sends the request to the Ollama API for a specific agent.
    
    Returns:
        A dictionary containing the generated code candidate and the model used.
    """
    strategy = f"Apply recursive reasoning (depth {reasoning_depth}) and fractal code structure."
    
    full_prompt = (
        f"You are an expert coding agent (Agent ID: {agent_id}, Model: {model}).\n"
        f"You are in round {round_num + 1} of a multi-agent consensus.\n"
        f"Your assigned strategy is: \"{strategy}\".\n"
        f"Analyze the user's request and the provided code to generate an improved or new code snippet.\n\n"
        f"USER REQUEST: \"{prompt}\"\n\n"
        f"CODE CONTEXT ({file_type}):\n"
        f"```\n{context}\n```\n\n"
        f"Provide ONLY the generated code snippet as your response. Do not include explanations, apologies, or markdown formatting."
    )
    
    payload = {
        "model": model,
        "prompt": full_prompt,
        "stream": False,
        # Ollama raw mode ensures minimal pre-processing/post-processing
        "raw": True 
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=payload)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        json_response = response.json()
        code_candidate = json_response.get("response", "").strip()
        
        # Add metadata comments to the top of the code for client display
        final_candidate = (
            f"// Agent: {agent_id} | Model: {model} | Round: {round_num + 1}\n"
            f"// Seed: {origin[:12]}\n"
            f"{code_candidate}"
        )
        return {"candidate": final_candidate, "model": model, "success": True}
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Ollama connection error for agent {agent_id}: {e}"
        print(error_msg)
        return {"candidate": f"// Agent {agent_id} failed to generate a response.\n// Error: {error_msg}", "model": model, "success": False}

def assemble_final_answer(all_fragments, genesis_hash):
    """
    Groups candidates, scores them based on agent consensus and entropy, and selects the best one.
    """
    candidate_groups = {}
    for fragment in all_fragments:
        # Normalize code (remove comments/whitespace) for grouping
        key = fragment['candidate'].split('\n')
        key = "\n".join([line for line in key if not line.strip().startswith('//')]).replace('\s', '').strip()
        
        if not key: continue

        if key not in candidate_groups:
            candidate_groups[key] = {
                'candidates': [], 
                'totalEntropy': 0, 
                'agents': set(), 
                'rounds': set(),
                'root_candidate': None # Store candidate with highest individual entropy
            }
        
        group = candidate_groups[key]
        group['candidates'].append(fragment)
        group['totalEntropy'] += fragment['entropy']
        group['agents'].add(fragment['agentId'])
        group['rounds'].add(fragment['round'])

        # Track the candidate with the highest entropy for tie-breaking/root selection
        if group['root_candidate'] is None or fragment['entropy'] > group['root_candidate']['entropy']:
             group['root_candidate'] = fragment


    scored_groups = []
    for key, group in candidate_groups.items():
        if not group['candidates']: continue
        
        agent_count = len(group['agents'])
        round_count = len(group['rounds'])
        avg_entropy = group['totalEntropy'] / len(group['candidates'])
        
        # Scoring Formula: Prioritize coverage (agents/rounds) and cryptographic uniqueness (entropy)
        score = (agent_count * 2) + (round_count * 1.5) + (avg_entropy * 3) 
        
        scored_groups.append({
            'key': key,
            'score': round(score, 3),
            'agentCount': agent_count,
            'roundCount': round_count,
            'avgEntropy': round(avg_entropy, 3),
            'rootAgent': group['root_candidate']['agentId'],
            'rootEntropy': group['root_candidate']['entropy'],
            'candidate': group['candidates'][0]['candidate']
        })

    if not scored_groups:
        return {
            'genesis': genesis_hash, 
            'selectedCandidate': "// No valid code candidates were generated by the agents.", 
            'score': 0, 
            'allGroups': []
        }

    scored_groups.sort(key=lambda x: x['score'], reverse=True)
    top_group = scored_groups[0]
    
    return {
        'genesis': genesis_hash, 
        'selectedCandidate': top_group['candidate'], 
        'score': top_group['score'],
        'agentCount': top_group['agentCount'], 
        'roundCount': top_group['roundCount'], 
        'avgEntropy': top_group['avgEntropy'],
        'rootAgent': top_group['rootAgent'], 
        'rootEntropy': top_group['rootEntropy'], 
        'allGroups': scored_groups
    }

# --- FLASK API ENDPOINT ---

@app.route('/api/orchestrate', methods=['POST'])
def orchestrate():
    """
    Main endpoint to receive client request, run the multi-agent system, and return results.
    """
    try:
        data = request.json
        
        # Required inputs from the client
        editor_context = data.get('codeContext', '')
        prompt_text = data.get('prompt', 'Optimize this code')
        agent_count = data.get('agentCount', 5)
        max_rounds = data.get('maxRounds', 3)
        reasoning_depth = data.get('reasoningDepth', 3)
        file_type = data.get('fileType', 'javascript')

        genesis_hash = sha256(f"GENESIS{time.time()}{editor_context}")
        
        fragments = []
        log_entries = []
        
        log_entries.append({"agent": "nexus", "message": f"Genesis Hash: {genesis_hash[:16]}...", "type": "genesis"})
        log_entries.append({"agent": "nexus", "message": f"Orchestrating {agent_count} agents for {max_rounds} rounds.", "type": "info"})
        
        # Initialize agents
        agents = []
        for i in range(agent_count):
            agent_id = f'agent-{i}'
            origin_hash = sha256(f"{genesis_hash}{agent_id}{random.random()}")
            agents.append({'id': agent_id, 'origin': origin_hash})
        
        # Orchestration Rounds
        for round_num in range(max_rounds):
            log_entries.append({"agent": "relay", "message": f"Starting Round {round_num + 1}/{max_rounds}...", "type": "info"})
            
            round_fragments = []
            
            for agent in agents:
                model = get_next_model()
                
                # Perform the LLM call
                result = perform_fractal_reasoning(
                    agent['id'], model, prompt_text, editor_context, round_num, 
                    agent['origin'], file_type, reasoning_depth
                )
                
                new_origin = sha256(f"{agent['origin']}{genesis_hash}{round_num}")
                agent['origin'] = new_origin
                
                # Store the fragment data
                fragment = {
                    'agentId': agent['id'],
                    'origin': agent['origin'],
                    'round': round_num,
                    'candidate': result['candidate'],
                    'entropy': calculate_entropy(new_origin),
                    'model': model
                }
                
                fragments.append(fragment)
                round_fragments.append(fragment)
                
                log_entries.append({
                    "agent": "sentinel", 
                    "message": f"Fragment from {agent['id']} (Model: {model}) - Entropy: {fragment['entropy']}", 
                    "type": "fragment"
                })

        # Final Consensus
        log_entries.append({"agent": "sentinel", "message": "Assembling final consensus...", "type": "info"})
        consensus = assemble_final_answer(fragments, genesis_hash)
        
        # Return the final result and all logs for the client to display
        return jsonify({
            "status": "success",
            "log": log_entries,
            "consensus": consensus
        })
        
    except Exception as e:
        print(f"Server Orchestration Error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "log": [{"agent": "nexus", "message": f"Critical Server Error: {e}", "type": "error"}]
        }), 500

# --- RUN SERVER ---

if __name__ == '__main__':
    print("--- Ollama Multi-Agent Orchestrator ---")
    print("WARNING: Ensure Ollama is running on port 11434 before starting.")
    print("Starting Flask server on http://127.0.0.1:5000")
    # Use threaded=True for concurrent requests from the client
    app.run(host='127.0.0.1', port=5000, debug=True, threaded=True)
