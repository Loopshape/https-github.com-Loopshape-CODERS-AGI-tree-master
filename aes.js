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
