import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ollamaEditImage, ollamaGenerateImage, ollamaAnalyzeImage, ollamaGenerateColorPalette, ollamaGenerateContentMultiModel, Color, ModelStatus } from './services/ollamaService';
import { geminiGenerateText, geminiGenerateImage, geminiEditImage, geminiAnalyzeImage, geminiGenerateColorPalette, geminiStreamChat, ChatMessagePart } from './services/geminiService'; // Import Gemini service
import { Type } from '@google/genai'; // Needed for responseSchema

// --- Helper Functions ---

const resizeImage = (dataUrl: string, maxDimension: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            let { width, height } = img;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, width, height);
            // Using JPEG for smaller file size, with a quality setting of 90%
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = (error) => reject(error);
    });
};


// --- UI Components ---

const Header = () => (
    <header className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 fixed top-0 left-0 right-0 z-30">
        <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
                 <svg className="w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h1 className="text-xl font-bold text-white tracking-wider">Creative Suite</h1> {/* Updated title */}
            </div>
        </div>
    </header>
);

const Spinner = ({ text = "Working its magic..." }) => (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center rounded-lg z-20">
        <div className="flex flex-col items-center text-center p-4">
             <svg className="animate-spin h-10 w-10 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-lg text-gray-300 font-semibold">{text}</p>
            <p className="text-sm text-gray-400">This can take a moment.</p>
        </div>
    </div>
);

const UploadPlaceholder = () => (
    <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-400">Upload an image to start</h3>
        <p className="mt-2 text-sm">Use the controls on the left to select a file from your device.</p>
    </div>
);

const ErrorDisplay = ({ error, onClear }: { error: string | null; onClear: () => void }) => {
    if (!error) return null;
    return (
        <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg text-sm" role="alert">
            <div className="flex justify-between items-center">
                <div>
                    <p className="font-semibold">An error occurred</p>
                    <p>{error}</p>
                </div>
                <button onClick={onClear} className="text-red-300 hover:text-white">&times;</button>
            </div>
        </div>
    );
};

const handleApiError = (err: unknown, setError: (message: string) => void, action: string, provider: BackendProvider) => {
    let displayMessage: string;
    let rawMessage = err instanceof Error ? err.message : String(err);
    const lowerCaseMessage = rawMessage.toLowerCase();
    const prefix = provider === 'ollama' ? 'Ollama' : 'Gemini';

    // Specific error handling for Ollama connectivity
    if (provider === 'ollama' && (lowerCaseMessage.includes('failed to fetch') || lowerCaseMessage.includes('network error') || lowerCaseMessage.includes('connection refused'))) {
        displayMessage = `${prefix} server: Could not connect to Ollama server. Please ensure Ollama is running at http://localhost:11434 and the 'llava' model is available.`;
    }
    // Ollama model not found
    else if (provider === 'ollama' && (lowerCaseMessage.includes('model not found') || lowerCaseMessage.includes('pull model'))) {
        displayMessage = `${prefix} model: Ollama model 'llava' not found. Please ensure the 'llava' model is downloaded and available in your Ollama installation.`;
    }
    // Gemini API key error
    else if (provider === 'gemini' && (lowerCaseMessage.includes('api_key') || lowerCaseMessage.includes('invalid api key'))) {
        displayMessage = `${prefix} API Key: Please ensure your Gemini API key is correctly configured.`;
    }
    // General API errors (e.g., malformed request, internal server error)
    else if (lowerCaseMessage.includes('api error') || lowerCaseMessage.includes('400') || lowerCaseMessage.includes('500')) {
        displayMessage = `${prefix} API error: ${rawMessage}. Check server logs for more details.`;
    }
    // Safety violations
    else if (lowerCaseMessage.includes('safety') || lowerCaseMessage.includes('blocked') || lowerCaseMessage.includes('harmful')) {
        displayMessage = "The request was blocked, possibly due to safety settings. Please try a different prompt or adjust your input.";
    }
    // No content returned
    else if (lowerCaseMessage.includes('no content was returned') || lowerCaseMessage.includes('empty response')) {
        displayMessage = `${prefix} returned an empty response. The prompt may be too ambiguous or require further refinement.`;
    }
    // Invalid input data (e.g., malformed image data URL, JSON parsing errors)
    else if (lowerCaseMessage.includes('invalid data url') || lowerCaseMessage.includes('mime type') || (lowerCaseMessage.includes('json') && lowerCaseMessage.includes('parse'))) {
        displayMessage = `Unsupported image format, corrupt data, or invalid AI response structure from ${prefix}. Please try a different PNG or JPEG file or simplify the prompt.`;
    }
    // Fallback for any other unexpected errors
    else {
        const cleanedMessage = rawMessage.replace(/Failed to (?:edit|generate|analyze) (?:image|palette|content|response):?/gi, "").trim();
        displayMessage = `An unexpected error occurred with ${prefix}: ${cleanedMessage || 'Please try again.'}`;
    }

    console.error(`${prefix} API action "${action}" failed:`, err);
    setError(displayMessage);
};

// --- Feature Views ---

type BackendProvider = 'ollama' | 'gemini';

const ImageEditorView = ({ image, onImageUpload, clearError, setError, backendProvider }: any) => {
    const [editedOutput, setEditedOutput] = useState<string | null>(null); // Can be image data URL or text
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const editorExamples = [
        'Add a dramatic, cinematic filter',
        'Make the image black and white',
        'Change the style to a watercolor painting',
        'Add a unicorn flying in the sky'
    ];

    useEffect(() => {
        setEditedOutput(null);
        setPrompt('');
        clearError();
    }, [image, clearError, backendProvider]);

    const handleGenerate = useCallback(async () => {
        if (!image || !prompt.trim()) {
            setError("Please upload an image and enter a prompt.");
            return;
        }
        setIsLoading(true);
        clearError();

        try {
            if (backendProvider === 'ollama') {
                const result = await ollamaEditImage(image, prompt);
                setEditedOutput(result); // Text description
            } else { // Gemini
                const result = await geminiEditImage(image, prompt);
                setEditedOutput(result); // Actual image
            }
        } catch (err) {
            handleApiError(err, setError, 'edit', backendProvider);
        } finally {
            setIsLoading(false);
        }
    }, [image, prompt, setError, clearError, backendProvider]);

    const displayTextOutputHint = backendProvider === 'ollama';

    return (
        <>
            <ControlsColumn>
                <UploadControl step={1} onImageUpload={onImageUpload} hasImage={!!image} />
                <PromptControl step={2} prompt={prompt} setPrompt={setPrompt} disabled={!image} placeholder="e.g., 'Add a retro cinematic filter'" examples={editorExamples} />
                <GenerateButton onClick={handleGenerate} disabled={!image || !prompt.trim() || isLoading} text={isLoading ? 'Editing...' : `Generate ${displayTextOutputHint ? 'Edit Description' : 'Edited Image'}`} />
                 {displayTextOutputHint && (
                    <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                        <p className="font-semibold text-gray-300">Note:</p>
                        <p>Ollama models currently provide a textual description of the image edit, not a modified image.</p>
                    </div>
                 )}
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative">
                    {isLoading && <Spinner text="Applying your edits..." />}
                    {!image && <UploadPlaceholder />}
                    {image && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                            <ImageDisplay title="Original" src={image} />
                            <ImageDisplay
                                title={displayTextOutputHint ? "Edited Description" : "Edited Image"}
                                src={editedOutput}
                                placeholder={displayTextOutputHint ? "Your edited image description will appear here" : "Your edited image will appear here"}
                                download={!displayTextOutputHint && !!editedOutput}
                            />
                        </div>
                    )}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageGeneratorView = ({ setError, clearError, backendProvider }: any) => {
    const [generatedOutput, setGeneratedOutput] = useState<string | null>(null); // Can be image data URL or text
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [aspectRatio, setAspectRatio] = useState<string>('1:1');

     const generatorExamples = [
        'A cute robot holding a red balloon, 3D render',
        'Logo for a tech startup, minimalist, blue/white',
        'Oil painting of a stormy sea',
        'Photorealistic cup of coffee on a wooden desk'
    ];

    useEffect(() => {
        setGeneratedOutput(null);
        setPrompt('');
        clearError();
    }, [clearError, backendProvider]);

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a prompt to generate content.");
            return;
        }
        setIsLoading(true);
        clearError();
        setGeneratedOutput(null);

        try {
            if (backendProvider === 'ollama') {
                const result = await ollamaGenerateImage(prompt);
                setGeneratedOutput(result); // Text description
            } else { // Gemini
                const result = await geminiGenerateImage(prompt, aspectRatio);
                setGeneratedOutput(result); // Actual image
            }
        } catch (err) {
            handleApiError(err, setError, 'generate', backendProvider);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, aspectRatio, setError, clearError, backendProvider]);

    const displayTextOutputHint = backendProvider === 'ollama';

    return (
        <>
            <ControlsColumn>
                <PromptControl step={1} prompt={prompt} setPrompt={setPrompt} placeholder="e.g., 'A vibrant oil painting of a cat wearing a wizard hat'" examples={generatorExamples} />
                 <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <StepIndicator step={2} />
                    <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Aspect Ratio</h3>
                    {backendProvider === 'gemini' ? (
                        <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            aria-label="Select aspect ratio"
                        >
                            <option value="1:1">1:1 (Square)</option>
                            <option value="4:3">4:3 (Standard)</option>
                            <option value="3:4">3:4 (Portrait)</option>
                            <option value="16:9">16:9 (Landscape)</option>
                            <option value="9:16">9:16 (Tall Portrait)</option>
                        </select>
                    ) : (
                        <p className="text-sm text-gray-400">Ollama models currently generate textual descriptions of images and do not support explicit aspect ratio control.</p>
                    )}
                </div>
                <GenerateButton onClick={handleGenerate} disabled={!prompt.trim() || isLoading} text={isLoading ? 'Generating...' : `Generate ${displayTextOutputHint ? 'Image Description' : 'Image'}`} />
                 {displayTextOutputHint && (
                    <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                        <p className="font-semibold text-gray-300">Note:</p>
                        <p>Ollama models currently provide a textual description of the generated image, not the image itself.</p>
                    </div>
                 )}
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative h-full flex items-center justify-center">
                    {isLoading && <Spinner />}
                    {!generatedOutput && !isLoading && <div className="text-gray-500 text-center">Your generated {displayTextOutputHint ? 'image description' : 'image'} will appear here</div>}
                    {generatedOutput && (
                        <ImageDisplay
                            src={generatedOutput}
                            title={displayTextOutputHint ? "Generated Description" : "Generated Image"}
                            download={!displayTextOutputHint && !!generatedOutput}
                        />
                    )}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageAnalyzerView = ({ image, onImageUpload, setError, clearError, backendProvider }: any) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        setAnalysis('');
        clearError();
    }, [image, clearError, backendProvider]);

    const handleAnalyze = useCallback(async () => {
        if (!image) {
            setError("Please upload an image to analyze.");
            return;
        }
        setIsLoading(true);
        clearError();
        setAnalysis('');
        try {
            if (backendProvider === 'ollama') {
                const result = await ollamaAnalyzeImage(image);
                setAnalysis(result);
            } else { // Gemini
                const result = await geminiAnalyzeImage(image);
                setAnalysis(result);
            }
        } catch (err) {
            handleApiError(err, setError, 'analyze', backendProvider);
        } finally {
            setIsLoading(false);
        }
    }, [image, setError, clearError, backendProvider]);

    return (
        <>
            <ControlsColumn>
                <UploadControl step={1} onImageUpload={onImageUpload} hasImage={!!image} />
                <GenerateButton onClick={handleAnalyze} disabled={!image || isLoading} text={isLoading ? 'Analyzing...' : 'Analyze Image'} />
                {analysis && !isLoading && (
                    <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 max-h-96 overflow-y-auto">
                         <h3 className="text-sm font-semibold text-gray-400 mb-2">Analysis Results ({backendProvider === 'ollama' ? 'Ollama' : 'Gemini'})</h3>
                         <p className="text-gray-300 whitespace-pre-wrap text-sm">{analysis}</p>
                    </div>
                )}
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative">
                    {isLoading && <Spinner text="Analyzing your image..." />}
                    {!image && <UploadPlaceholder />}
                    {image && <ImageDisplay src={image} />}
                </div>
            </ResultColumn>
        </>
    );
};

const ColorPaletteView = ({ setError, clearError, backendProvider }: any) => {
    const [paletteMode, setPaletteMode] = useState<'image' | 'theme'>('image');
    const [image, setImage] = useState<string | null>(null);
    const [themePrompt, setThemePrompt] = useState('');
    const [palette, setPalette] = useState<Color[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setImage(null);
        setThemePrompt('');
        setPalette([]);
        clearError();
    }, [clearError, backendProvider]);

    const handleGenerate = useCallback(async () => {
        if (paletteMode === 'image' && !image) {
            setError("Please upload an image to extract a palette.");
            return;
        }
        if (paletteMode === 'theme' && !themePrompt.trim()) {
            setError("Please enter a theme to generate a palette.");
            return;
        }

        setIsLoading(true);
        clearError();
        setPalette([]);

        try {
            const source = paletteMode === 'image' ? { image } : { text: themePrompt };
            let result: Color[];
            if (backendProvider === 'ollama') {
                result = await ollamaGenerateColorPalette(source as any);
            } else { // Gemini
                result = await geminiGenerateColorPalette(source);
            }
            setPalette(result);
        } catch (err) {
            handleApiError(err, setError, 'palette generation', backendProvider);
        } finally {
            setIsLoading(false);
        }
    }, [paletteMode, image, themePrompt, setError, clearError, backendProvider]);

    return (
        <>
            <ControlsColumn>
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <StepIndicator step={1} />
                    <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Palette Source ({backendProvider === 'ollama' ? 'Ollama' : 'Gemini'})</h3>
                    <div className="flex bg-gray-900 rounded-md p-1">
                        <button onClick={() => setPaletteMode('image')} className={`w-1/2 py-2 text-sm rounded-md transition-colors ${paletteMode === 'image' ? 'bg-cyan-600 text-white font-bold' : 'hover:bg-gray-700'}`}>From Image</button>
                        <button onClick={() => setPaletteMode('theme')} className={`w-1/2 py-2 text-sm rounded-md transition-colors ${paletteMode === 'theme' ? 'bg-cyan-600 text-white font-bold' : 'hover:bg-gray-700'}`}>From Theme</button>
                    </div>
                </div>

                {paletteMode === 'image' ? (
                     <UploadControl step={2} onImageUpload={setImage} hasImage={!!image} />
                ) : (
                    <PromptControl step={2} prompt={themePrompt} setPrompt={setThemePrompt} placeholder="e.g., 'Cyberpunk city at night' or 'Autumn forest'"/>
                )}

                <GenerateButton
                    onClick={handleGenerate}
                    disabled={isLoading || (paletteMode === 'image' && !image) || (paletteMode === 'theme' && !themePrompt.trim())}
                    text={isLoading ? 'Generating...' : 'Generate Palette'}
                />
            </ControlsColumn>
            <ResultColumn>
                <div className="flex-grow relative flex items-center justify-center">
                    {isLoading && <Spinner text="Crafting your palette..." />}
                    {!isLoading && palette.length === 0 && (
                        <div className="text-gray-500 text-center">
                             {paletteMode === 'image' && image && <ImageDisplay src={image} />}
                            <p className="mt-4">Your generated color palette will appear here.</p>
                        </div>
                    )}
                    {palette.length > 0 && <PaletteDisplay palette={palette} />}
                </div>
            </ResultColumn>
        </>
    );
};

// --- Chat Message Interfaces (Shared) ---
interface BaseChatMessage {
    type: 'user' | 'model';
    content: string;
    timestamp: string;
}

interface OllamaChatMessage extends BaseChatMessage {
    modelName?: string;
}

interface GeminiChatMessage extends BaseChatMessage {
    modelName?: string; // For model responses
    groundingChunks?: Array<any>;
}

// --- Ollama Multi-Model Chat View ---
const OLLAMA_CHAT_MODELS = ['core', 'loop', '2244', 'coin', 'code']; // Define model pool

const OllamaChatView = ({ chatHistory, isLoading, modelStatuses, currentChatPrompt, setCurrentChatPrompt, handleSendMessage, setError, clearError }: {
    chatHistory: OllamaChatMessage[]; isLoading: boolean; modelStatuses: Record<string, ModelStatus>;
    currentChatPrompt: string; setCurrentChatPrompt: (s: string) => void; handleSendMessage: () => Promise<void>;
    setError: (message: string) => void; clearError: () => void;
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    return (
        <div className="flex-grow flex flex-col p-6 bg-gray-900 overflow-y-auto">
            {chatHistory.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                    <svg className="w-20 h-20 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-gray-400">Start a Multi-Model Chat (Ollama)</h3>
                    <p className="mt-2 text-sm">Your conversation will appear here, with responses from multiple Ollama models.</p>
                </div>
            )}
            {chatHistory.map((msg, index) => (
                <div key={index} className={`mb-4 p-3 rounded-lg max-w-[80%] ${msg.type === 'user' ? 'bg-blue-800/40 self-end text-right' : 'bg-gray-800/40 self-start text-left'}`}>
                    <div className="text-xs text-gray-400 mb-1">
                        {msg.type === 'user' ? (
                            'You'
                        ) : (
                            <span className="font-semibold text-cyan-400">{msg.modelName || 'Model'}</span>
                        )}
                        <span className="ml-2 text-gray-500">{msg.timestamp}</span>
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">{msg.content}</div>
                </div>
            ))}
            {isLoading && (
                <div className="self-start text-left mb-4 p-3 rounded-lg bg-gray-800/40">
                    <Spinner text="Ollama models are generating responses..." />
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};

// --- Gemini Chat View ---

const GEMINI_CHAT_MODELS = {
    'gemini-2.5-flash-lite': 'Gemini Flash Lite (Fast)',
    'gemini-2.5-flash': 'Gemini Flash (Standard)',
    'gemini-2.5-pro': 'Gemini Pro (Complex Tasks)',
    'gemini-2.5-pro-thinking-mode': 'Gemini Pro (Thinking Mode) - Max Budget',
};
const THINKING_BUDGET = 32768; // Max for 2.5 Pro

const GeminiChatView = ({ chatHistory, isLoading }: { // Removed config-related props and setters, now managed by App
    chatHistory: GeminiChatMessage[]; isLoading: boolean;
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const renderGroundingChunks = (chunks?: any[]) => {
        if (!chunks || chunks.length === 0) return null;
        const webLinks = chunks.filter(c => c.web).map(c => c.web);
        const mapLinks = chunks.filter(c => c.maps).map(c => c.maps);

        return (
            <div className="mt-2 text-xs text-gray-500 border-t border-gray-700 pt-2">
                {webLinks.length > 0 && (
                    <div className="mb-1">
                        <p className="font-semibold text-gray-400">Web Sources:</p>
                        <ul className="list-disc list-inside pl-2">
                            {webLinks.map((link, idx) => (
                                <li key={`web-${idx}`}>
                                    <a href={link.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{link.title || link.uri}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {mapLinks.length > 0 && (
                    <div>
                        <p className="font-semibold text-gray-400">Map Sources:</p>
                        <ul className="list-disc list-inside pl-2">
                            {mapLinks.map((link, idx) => (
                                <li key={`map-${idx}`}>
                                    <a href={link.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{link.title || link.uri}</a>
                                    {link.placeAnswerSources?.reviewSnippets && link.placeAnswerSources.reviewSnippets.length > 0 && (
                                        <p className="text-gray-500 italic ml-4 text-xs">"Reviews: {link.placeAnswerSources.reviewSnippets.map((s: any) => s.text).join('; ')}"</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-grow flex flex-col p-6 bg-gray-900 overflow-y-auto">
            {chatHistory.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                    <svg className="w-20 h-20 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-gray-400">Start a Gemini Chat</h3>
                    <p className="mt-2 text-sm">Select a model and settings to begin a conversation.</p>
                </div>
            )}
            {chatHistory.map((msg, index) => (
                <div key={index} className={`mb-4 p-3 rounded-lg max-w-[80%] ${msg.type === 'user' ? 'bg-blue-800/40 self-end text-right' : 'bg-gray-800/40 self-start text-left'}`}>
                    <div className="text-xs text-gray-400 mb-1">
                        {msg.type === 'user' ? (
                            'You'
                        ) : (
                            <span className="font-semibold text-cyan-400">{msg.modelName || 'Model'}</span>
                        )}
                        <span className="ml-2 text-gray-500">{msg.timestamp}</span>
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">{msg.content}</div>
                    {msg.groundingChunks && renderGroundingChunks(msg.groundingChunks)}
                </div>
            ))}
            {isLoading && (
                <div className="self-start text-left mb-4 p-3 rounded-lg bg-gray-800/40">
                    <Spinner text="Gemini is generating response..." />
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};


// --- Control Primitives ---

interface ColumnProps {
  children: React.ReactNode;
}

const ControlsColumn: React.FC<ColumnProps> = ({ children }) => (
    <div className="w-full md:w-80 lg:w-96 bg-gray-900/50 backdrop-blur-sm border-r border-gray-700 p-4 flex flex-col space-y-4 overflow-y-auto">
        {children}
    </div>
);

const ResultColumn: React.FC<ColumnProps> = ({ children }) => (
    <main className="flex-1 p-6 flex flex-col bg-gray-900 overflow-hidden">
        {children}
    </main>
);

const StepIndicator = ({ step }: { step: number }) => (
    <div className="flex items-center space-x-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500 text-gray-900 font-bold text-sm">{step}</span>
        <div className="w-full h-px bg-gray-700"></div>
    </div>
);

const UploadControl = ({ step, onImageUpload, hasImage }: { step: number, onImageUpload: (dataUrl: string) => void, hasImage: boolean }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isResizing, setIsResizing] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsResizing(true);
            const reader = new FileReader();
            reader.onload = async (e) => {
                const originalDataUrl = e.target?.result as string;
                if (!originalDataUrl) {
                    setIsResizing(false);
                    return;
                }
                try {
                    const resizedDataUrl = await resizeImage(originalDataUrl, 1024);
                    onImageUpload(resizedDataUrl);
                } catch (err) {
                    console.error("Image resize failed, using original", err);
                    onImageUpload(originalDataUrl); // Fallback to original
                } finally {
                    setIsResizing(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <StepIndicator step={step} />
            <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">{hasImage ? "Change Image" : "Upload Image"}</h3>
            <p className="text-sm text-gray-400 mb-4">Select a PNG or JPEG to begin.</p>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg"
                className="hidden"
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isResizing}
                className="w-full bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 disabled:opacity-75 disabled:cursor-wait"
            >
                {isResizing ? 'Processing...' : hasImage ? "Select New File" : "Choose a File"}
            </button>
        </div>
    );
};

const PromptExamples = ({ examples, onSelect }: { examples: string[], onSelect: (prompt: string) => void }) => {
    if (!examples || examples.length === 0) return null;
    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Examples</h4>
            <div className="flex flex-wrap gap-2">
                {examples.map((example, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(example)}
                        className="px-2 py-1 bg-gray-700 text-gray-300 rounded-md text-xs hover:bg-gray-600 hover:text-white transition-colors"
                    >
                        {example}
                    </button>
                ))}
            </div>
        </div>
    );
};


const PromptControl = ({ step, prompt, setPrompt, disabled = false, placeholder, examples = [] }: { step?: number, prompt: string, setPrompt: (p: string) => void, disabled?: boolean, placeholder?: string, examples?: string[] }) => (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        {step && <StepIndicator step={step} />}
        <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Describe Your Vision</h3>
        <p className="text-sm text-gray-400 mb-4">What do you want to create or change? Be descriptive!</p>
        <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full h-24 p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
            aria-label="Prompt for image generation or editing"
        />
        <PromptExamples examples={examples} onSelect={setPrompt} />
    </div>
);

const GenerateButton = ({ onClick, disabled, text }: { onClick: () => void; disabled: boolean; text: string }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3 px-4 rounded-md hover:from-cyan-400 hover:to-blue-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
    >
        {text}
    </button>
);


const ImageDisplay = ({ title, src, placeholder, download = false }: { title?: string; src: string | null; placeholder?: string; download?: boolean }) => {
    const isImage = src && (src.startsWith('data:image') || src.startsWith('blob:'));
    const isTextOutput = src && !isImage; // If src exists but isn't a data URL, assume it's text

    return (
        <div className="bg-gray-800/50 rounded-lg p-3 flex flex-col border border-gray-700 h-full">
            {title && <h3 className="text-md font-semibold text-gray-300 mb-2">{title}</h3>}
            <div className="flex-grow flex items-center justify-center relative min-h-[200px] text-gray-300">
                {isImage ? (
                     <img src={src!} alt={title || 'Generated or edited content'} className="max-w-full max-h-full object-contain rounded-md" />
                ) : isTextOutput ? (
                    <p className="whitespace-pre-wrap text-sm p-2 bg-gray-900 rounded-md max-h-full overflow-y-auto w-full text-left">{src}</p> // Display text
                ) : (
                    <p className="text-gray-500">{placeholder}</p>
                )}
            </div>
             {isImage && download && (
                <a
                    href={src!}
                    download="creative-suite-output.png"
                    className="mt-3 text-center w-full bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors text-sm"
                >
                    Download Image
                </a>
            )}
        </div>
    );
};

const PaletteDisplay = ({ palette }: { palette: Color[] }) => {
    const [copiedHex, setCopiedHex] = useState<string | null>(null);

    const handleCopy = (hex: string) => {
        navigator.clipboard.writeText(hex);
        setCopiedHex(hex);
        setTimeout(() => setCopiedHex(null), 2000);
    };

    return (
        <div className="w-full max-w-4xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {palette.map((color) => (
                    <div key={color.hex} className="rounded-lg overflow-hidden shadow-lg border border-gray-700">
                        <div style={{ backgroundColor: color.hex }} className="h-40 w-full"></div>
                        <div className="p-4 bg-gray-800">
                            <p className="font-bold text-gray-200 text-sm truncate">{color.name}</p>
                            <button
                                onClick={() => handleCopy(color.hex)}
                                className="font-mono text-cyan-400 text-sm mt-1 hover:text-white transition-colors w-full text-left"
                                title="Copy hex code"
                            >
                                {copiedHex === color.hex ? 'Copied!' : color.hex}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- Main App Component ---

type AppMode = 'edit' | 'generate' | 'analyze' | 'palette' | 'ollama_chat' | 'gemini_chat';

export default function App() {
    const [mode, setMode] = useState<AppMode>('edit');
    const [backendProvider, setBackendProvider] = useState<BackendProvider>('ollama'); // New state for backend provider
    const [image, setImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Ollama chat states
    const [ollamaChatHistory, setOllamaChatHistory] = useState<OllamaChatMessage[]>([]);
    const [currentOllamaChatPrompt, setCurrentOllamaChatPrompt] = useState<string>('');
    const [isOllamaChatLoading, setIsOllamaChatLoading] = useState<boolean>(false);
    const [ollamaModelStatuses, setOllamaModelStatuses] = useState<Record<string, ModelStatus>>(
        Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'idle']))
    );

    // Gemini chat states
    const [geminiChatHistory, setGeminiChatHistory] = useState<GeminiChatMessage[]>([]);
    const [currentGeminiChatPrompt, setCurrentGeminiChatPrompt] = useState<string>('');
    const [isGeminiChatLoading, setIsGeminiChatLoading] = useState<boolean>(false);
    // Gemini chat configuration states, lifted from GeminiChatView
    const [selectedGeminiModel, setSelectedGeminiModel] = useState<keyof typeof GEMINI_CHAT_MODELS>('gemini-2.5-flash');
    const [enableGeminiSearchGrounding, setEnableGeminiSearchGrounding] = useState<boolean>(false);
    const [geminiSystemInstruction, setGeminiSystemInstruction] = useState<string>('');
    // Ref for Gemini chat history to be used in useCallback
    const geminiChatHistoryRef = useRef<GeminiChatMessage[]>(geminiChatHistory);

    const clearError = useCallback(() => setError(null), []);

    const handleImageUpload = (imageDataUrl: string) => {
        setImage(imageDataUrl);
        clearError();
    };

    // Keep chatHistoryRef up-to-date with actual geminiChatHistory state
    useEffect(() => {
        geminiChatHistoryRef.current = geminiChatHistory;
    }, [geminiChatHistory]);

    // Effect to manage search grounding when thinking mode is selected
    useEffect(() => {
        if (selectedGeminiModel === 'gemini-2.5-pro-thinking-mode' && enableGeminiSearchGrounding) {
            setEnableGeminiSearchGrounding(false);
        }
    }, [selectedGeminiModel, enableGeminiSearchGrounding]);


    // Handler for Ollama Multi-Model Chat
    const handleOllamaSendMessage = useCallback(async () => {
        if (!currentOllamaChatPrompt.trim()) return;

        const userMessage: OllamaChatMessage = {
            type: 'user',
            content: currentOllamaChatPrompt,
            timestamp: new Date().toLocaleTimeString(),
        };
        setOllamaChatHistory(prev => [...prev, userMessage]);
        setCurrentOllamaChatPrompt('');
        setIsOllamaChatLoading(true);
        clearError();

        // Reset model statuses to processing
        setOllamaModelStatuses(
            Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'processing']))
        );

        try {
            const results = await ollamaGenerateContentMultiModel(OLLAMA_CHAT_MODELS, currentOllamaChatPrompt, (modelName, status) => {
                setOllamaModelStatuses(prev => ({ ...prev, [modelName]: status }));
            });

            // Combine results into a single "fused" response
            const fusedResponseContent = results.map(res => {
                if (res.status === 'success') {
                    return `**${res.modelName}:**\n${res.response}`;
                } else {
                    return `**${res.modelName} (Error):**\nFailed to get response: ${res.error || 'Unknown error'}`;
                }
            }).join('\n\n---\n\n');

            const modelMessage: OllamaChatMessage = {
                type: 'model',
                content: fusedResponseContent,
                timestamp: new Date().toLocaleTimeString(),
                modelName: 'Ollama Pool', // Indicating it's a combined response
            };
            setOllamaChatHistory(prev => [...prev, modelMessage]);

        } catch (err) {
            handleApiError(err, setError, 'multi-model chat', 'ollama');
            // Set all models to error if a global orchestrator error occurs
            setOllamaModelStatuses(
                Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'error']))
            );
        } finally {
            setIsOllamaChatLoading(false);
            // After all processing, ensure models are set to idle if not already in error state
            setOllamaModelStatuses(prev => {
                const newStatuses = { ...prev };
                for (const model of OLLAMA_CHAT_MODELS) {
                    if (newStatuses[model] === 'processing') {
                        newStatuses[model] = 'idle';
                    }
                }
                return newStatuses;
            });
        }
    }, [currentOllamaChatPrompt, clearError, setError]);

    // Handler for Gemini Chat
    const handleGeminiSendMessage = useCallback(async () => {
        if (!currentGeminiChatPrompt.trim()) return;

        const userMessage: GeminiChatMessage = {
            type: 'user',
            content: currentGeminiChatPrompt,
            timestamp: new Date().toLocaleTimeString(),
        };

        // Convert current chat history to Gemini ChatMessage format for API call
        const geminiApiHistory: { role: 'user' | 'model', parts: ChatMessagePart[] }[] = geminiChatHistoryRef.current.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        setGeminiChatHistory(prev => [...prev, userMessage]);
        setCurrentGeminiChatPrompt('');
        setIsGeminiChatLoading(true);
        clearError();

        let fullModelResponse = '';
        let groundingChunks: any[] = [];
        let modelUsed = selectedGeminiModel;

        const isThinkingModeSelected = selectedGeminiModel === 'gemini-2.5-pro-thinking-mode';
        const modelForApi = isThinkingModeSelected ? 'gemini-2.5-pro' : selectedGeminiModel;
        const thinkingBudget = isThinkingModeSelected ? THINKING_BUDGET : undefined;
        // Search grounding is explicitly disabled when thinking mode is active
        const enableSearchForApi = isThinkingModeSelected ? false : enableGeminiSearchGrounding;


        try {
            const stream = geminiStreamChat(
                modelForApi,
                currentGeminiChatPrompt,
                geminiApiHistory, // Use the converted history for the API call
                geminiSystemInstruction,
                enableSearchForApi,
                thinkingBudget,
            );

            // Add a placeholder for the model's response to enable streaming updates
            setGeminiChatHistory(prev => [...prev, {
                type: 'model',
                content: '', // Initial empty content
                timestamp: new Date().toLocaleTimeString(),
                modelName: GEMINI_CHAT_MODELS[modelUsed as keyof typeof GEMINI_CHAT_MODELS],
                groundingChunks: [],
            }]);

            for await (const chunk of stream) {
                fullModelResponse += chunk.text;
                if (chunk.groundingChunks) {
                    groundingChunks = [...groundingChunks, ...chunk.groundingChunks];
                }
                // Update the *last* message (which is the model's response) with streaming content
                setGeminiChatHistory(prev => prev.map((msg, idx) =>
                    idx === prev.length - 1 ? { ...msg, content: fullModelResponse } : msg
                ));
            }

            // After stream is complete, ensure grounding chunks are fully updated on the last message
            setGeminiChatHistory(prev => prev.map((msg, idx) =>
                idx === prev.length - 1 ? { ...msg, groundingChunks: groundingChunks } : msg
            ));

        } catch (err) {
            handleApiError(err, setError, 'gemini chat', 'gemini');
            // If an error occurs during streaming, ensure the loading state is reset and display error in chat
            setGeminiChatHistory(prev => prev.map((msg, idx) =>
                idx === prev.length - 1 && msg.type === 'model' && msg.content === ''
                    ? { ...msg, content: `Error: ${err instanceof Error ? err.message : String(err)}`, type: 'model' }
                    : msg
            ));
        } finally {
            setIsGeminiChatLoading(false);
        }
    }, [currentGeminiChatPrompt, selectedGeminiModel, enableGeminiSearchGrounding, geminiSystemInstruction, setGeminiChatHistory, setCurrentGeminiChatPrompt, setIsGeminiChatLoading, clearError, setError, geminiChatHistoryRef]);


    const renderView = () => {
        switch (mode) {
            case 'edit':
                return <ImageEditorView image={image} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} backendProvider={backendProvider} />;
            case 'generate':
                return <ImageGeneratorView setError={setError} clearError={clearError} backendProvider={backendProvider} />;
            case 'analyze':
                 return <ImageAnalyzerView image={image} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} backendProvider={backendProvider} />;
            case 'palette':
                return <ColorPaletteView setError={setError} clearError={clearError} backendProvider={backendProvider} />;
            case 'ollama_chat':
                return (
                    <OllamaChatView
                        chatHistory={ollamaChatHistory}
                        isLoading={isOllamaChatLoading}
                        modelStatuses={ollamaModelStatuses}
                        currentChatPrompt={currentOllamaChatPrompt}
                        setCurrentChatPrompt={setCurrentOllamaChatPrompt}
                        handleSendMessage={handleOllamaSendMessage}
                        setError={setError}
                        clearError={clearError}
                    />
                );
            case 'gemini_chat':
                return (
                    <GeminiChatView
                        chatHistory={geminiChatHistory}
                        isLoading={isGeminiChatLoading}
                        // Config and setters are now managed by App directly, not passed as props to GeminiChatView
                    />
                );
            default:
                return null;
        }
    };

    const handleBackendSwitch = (newProvider: BackendProvider) => {
        setBackendProvider(newProvider);
        clearError();
        // Reset current feature to a default for the new backend if needed
        if (newProvider === 'ollama' && mode === 'gemini_chat') {
            setMode('ollama_chat');
        } else if (newProvider === 'gemini' && mode === 'ollama_chat') {
            setMode('gemini_chat');
        }
        // Also clear image related states for a clean switch if the current mode is image-related
        setImage(null);
    };

    const isChatMode = mode === 'ollama_chat' || mode === 'gemini_chat';
    const isThinkingModeModelSelected = selectedGeminiModel === 'gemini-2.5-pro-thinking-mode';

    return (
        <div className="bg-gray-900 text-white h-screen flex flex-col font-sans">
            <Header />
            <div className="flex flex-grow pt-16 h-full overflow-hidden">
                <aside className="w-64 bg-gray-800/30 p-4 border-r border-gray-700 flex flex-col space-y-4">
                    <h2 className="text-lg font-semibold text-gray-300">AI Provider</h2>
                    <div className="flex bg-gray-900 rounded-md p-1">
                        <button
                            onClick={() => handleBackendSwitch('ollama')}
                            className={`w-1/2 py-2 text-sm rounded-md transition-colors ${backendProvider === 'ollama' ? 'bg-cyan-600 text-white font-bold' : 'hover:bg-gray-700'}`}
                        >
                            Ollama
                        </button>
                        <button
                            onClick={() => handleBackendSwitch('gemini')}
                            className={`w-1/2 py-2 text-sm rounded-md transition-colors ${backendProvider === 'gemini' ? 'bg-cyan-600 text-white font-bold' : 'hover:bg-gray-700'}`}
                        >
                            Gemini
                        </button>
                    </div>

                    <h2 className="text-lg font-semibold text-gray-300 mt-4">Tools</h2>
                    <nav className="flex flex-col space-y-2">
                        <ModeButton mode="edit" currentMode={mode} setMode={setMode} text={`Image Editor (${backendProvider === 'ollama' ? 'Text' : 'Image'} Output)`} />
                        <ModeButton mode="generate" currentMode={mode} setMode={setMode} text={`Image Generator (${backendProvider === 'ollama' ? 'Text' : 'Image'} Output)`} />
                        <ModeButton mode="analyze" currentMode={mode} setMode={setMode} text="Image Analyzer" />
                        <ModeButton mode="palette" currentMode={mode} setMode={setMode} text="Color Palette" />
                        {backendProvider === 'ollama' ? (
                            <ModeButton mode="ollama_chat" currentMode={mode} setMode={setMode} text="Ollama Multi-Model Chat" />
                        ) : (
                            <ModeButton mode="gemini_chat" currentMode={mode} setMode={setMode} text="Gemini Chat" />
                        )}
                    </nav>
                    <div className="mt-auto p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                        <p className="font-semibold text-gray-300">Tip:</p>
                        {backendProvider === 'ollama' ? (
                            <p>Ensure Ollama is running locally with the 'llava' model for image tasks, and all models in the chat pool (core, loop, 2244, coin, code) are available.</p>
                        ) : (
                            <p>Ensure your Gemini API key is configured. Cloud-based models are used for generation and processing.</p>
                        )}
                    </div>
                </aside>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {renderView()}
                    {/* Sticky input field at the bottom for chat modes */}
                    {isChatMode && (
                        <div className="bg-gray-800/50 p-4 border-t border-gray-700 flex flex-col items-center">
                            {backendProvider === 'ollama' && (
                                <div className="flex flex-wrap justify-center gap-2 mb-3">
                                    {OLLAMA_CHAT_MODELS.map(model => (
                                        <div key={model} className="flex items-center space-x-1">
                                            <span
                                                className={`w-3 h-3 rounded-full
                                                    ${ollamaModelStatuses[model] === 'processing' ? 'bg-cyan-500 animate-pulse' : ''}
                                                    ${ollamaModelStatuses[model] === 'success' ? 'bg-green-500' : ''}
                                                    ${ollamaModelStatuses[model] === 'error' ? 'bg-red-500' : ''}
                                                    ${ollamaModelStatuses[model] === 'idle' ? 'bg-gray-500' : ''}
                                                    `}
                                                title={`Model ${model} is ${ollamaModelStatuses[model] === 'processing' ? 'processing your request' : ollamaModelStatuses[model] === 'success' ? 'ready' : ollamaModelStatuses[model] === 'error' ? 'in an error state' : 'idle'}.`}
                                            ></span>
                                            <span className="text-xs text-gray-400">{model}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {backendProvider === 'gemini' && (
                                <div className="w-full max-w-4xl mb-4 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <label htmlFor="gemini-model-select" className="text-sm font-semibold text-gray-300 min-w-[80px]">Model:</label>
                                        <select
                                            id="gemini-model-select"
                                            value={selectedGeminiModel}
                                            onChange={(e) => setSelectedGeminiModel(e.target.value as keyof typeof GEMINI_CHAT_MODELS)}
                                            disabled={isGeminiChatLoading}
                                            className="flex-grow p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                                            aria-label="Select Gemini model"
                                        >
                                            {Object.entries(GEMINI_CHAT_MODELS).map(([key, value]) => (
                                                <option key={key} value={key}>{value}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <label htmlFor="system-instruction" className="text-sm font-semibold text-gray-300 min-w-[80px]">System Instruction:</label>
                                        <input
                                            id="system-instruction"
                                            type="text"
                                            value={geminiSystemInstruction}
                                            onChange={(e) => setGeminiSystemInstruction(e.target.value)}
                                            placeholder="e.g., 'You are a helpful assistant.'"
                                            disabled={isGeminiChatLoading}
                                            className="flex-grow p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                                            aria-label="System instruction for Gemini chat"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="enable-search"
                                            type="checkbox"
                                            checked={enableGeminiSearchGrounding}
                                            onChange={(e) => setEnableGeminiSearchGrounding(e.target.checked)}
                                            disabled={isGeminiChatLoading || isThinkingModeModelSelected} // Disable search for thinking mode to prevent config conflict
                                            className="form-checkbox h-4 w-4 text-cyan-600 bg-gray-900 border-gray-600 rounded focus:ring-cyan-500"
                                        />
                                        <label htmlFor="enable-search" className="text-sm text-gray-300">Enable Google Search Grounding</label>
                                        {isThinkingModeModelSelected && (
                                            <span className="text-xs text-red-400 ml-2"> (Disabled for Thinking Mode)</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="w-full max-w-4xl flex items-center space-x-2">
                                <textarea
                                    value={backendProvider === 'ollama' ? currentOllamaChatPrompt : currentGeminiChatPrompt}
                                    onChange={(e) => backendProvider === 'ollama' ? setCurrentOllamaChatPrompt(e.target.value) : setCurrentGeminiChatPrompt(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey && !(backendProvider === 'ollama' ? isOllamaChatLoading : isGeminiChatLoading)) {
                                            e.preventDefault();
                                            if (backendProvider === 'ollama') handleOllamaSendMessage();
                                            else handleGeminiSendMessage(); // Direct call to App's handleGeminiSendMessage
                                        }
                                    }}
                                    disabled={backendProvider === 'ollama' ? isOllamaChatLoading : isGeminiChatLoading}
                                    placeholder="Type your message here..."
                                    className="flex-grow h-auto max-h-32 min-h-[40px] p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 resize-y"
                                    aria-label="Natural prompt text input"
                                />
                                <button
                                    onClick={() => backendProvider === 'ollama' ? handleOllamaSendMessage() : handleGeminiSendMessage()} // Direct call to App's handleGeminiSendMessage
                                    disabled={(backendProvider === 'ollama' ? isOllamaChatLoading : isGeminiChatLoading) || !(backendProvider === 'ollama' ? currentOllamaChatPrompt.trim() : currentGeminiChatPrompt.trim())}
                                    className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 disabled:opacity-50"
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
             <div className="absolute bottom-4 right-6 w-full max-w-md">
                 <ErrorDisplay error={error} onClear={clearError} />
            </div>
        </div>
    );
}

const ModeButton = ({ mode, currentMode, setMode, text }: { mode: AppMode, currentMode: AppMode, setMode: (m: AppMode) => void, text: string }) => (
    <button
        onClick={() => setMode(mode)}
        className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm font-medium ${currentMode === mode ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'}`}
    >
        {text}
    </button>
);