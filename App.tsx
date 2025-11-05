import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ollamaEditImage, ollamaGenerateImage, ollamaAnalyzeImage, ollamaGenerateColorPalette, ollamaGenerateContentMultiModel, Color, ModelStatus } from './services/ollamaService'; // Changed import from geminiService

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
                <h1 className="text-xl font-bold text-white tracking-wider">Ollama Creative Suite</h1> {/* Updated title */}
            </div>
        </div>
    </header>
);

const Spinner = ({ text = "Ollama is working its magic..." }) => ( 
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

const handleApiError = (err: unknown, setError: (message: string) => void, action: string) => {
    let displayMessage: string;
    let rawMessage = err instanceof Error ? err.message : String(err);
    const lowerCaseMessage = rawMessage.toLowerCase();

    // Specific error handling for Ollama connectivity
    if (lowerCaseMessage.includes('failed to fetch') || lowerCaseMessage.includes('network error') || lowerCaseMessage.includes('connection refused')) {
        displayMessage = "Could not connect to Ollama server. Please ensure Ollama is running at http://localhost:11434 and the 'llava' model is available.";
    }
    // Ollama model not found
    else if (lowerCaseMessage.includes('model not found') || lowerCaseMessage.includes('pull model') ) {
        displayMessage = `Ollama model 'llava' not found. Please ensure the 'llava' model is downloaded and available in your Ollama installation.`;
    }
    // General API errors (e.g., malformed request, internal server error)
    else if (lowerCaseMessage.includes('ollama api error') || lowerCaseMessage.includes('400') || lowerCaseMessage.includes('500')) {
        displayMessage = `Ollama API error: ${rawMessage}. Check your Ollama server logs for more details.`;
    }
    // Safety violations (if Ollama models provide this, which is less common for local models without explicit filters)
    else if (lowerCaseMessage.includes('safety') || lowerCaseMessage.includes('blocked') || lowerCaseMessage.includes('harmful')) {
        displayMessage = "The request was blocked, possibly due to model safety settings. Please try a different prompt or adjust your input.";
    }
    // No content returned
    else if (lowerCaseMessage.includes('no content was returned') || lowerCaseMessage.includes('empty response')) {
        displayMessage = "Ollama returned an empty response. The prompt may be too ambiguous or require further refinement.";
    }
    // Invalid input data (e.g., malformed image data URL, JSON parsing errors)
    else if (lowerCaseMessage.includes('invalid data url') || lowerCaseMessage.includes('mime type') || (lowerCaseMessage.includes('json') && lowerCaseMessage.includes('parse')) ) {
        displayMessage = "Unsupported image format, corrupt data, or invalid AI response structure. Please try a different PNG or JPEG file or simplify the prompt.";
    }
    // Fallback for any other unexpected errors
    else {
        const cleanedMessage = rawMessage.replace(/Failed to (?:edit|generate|analyze) (?:image|palette|content|response):?/gi, "").trim();
        displayMessage = `An unexpected error occurred with Ollama: ${cleanedMessage || 'Please try again.'}`;
    }

    console.error(`Ollama API action "${action}" failed:`, err);
    setError(displayMessage);
};

// --- Feature Views ---

const ImageEditorView = ({ image, onImageUpload, clearError, setError }: any) => {
    const [editedImageDescription, setEditedImageDescription] = useState<string | null>(null); // Changed to description
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const editorExamples = [
        'Add a dramatic, cinematic filter',
        'Make the image black and white',
        'Change the style to a watercolor painting',
        'Add a unicorn flying in the sky'
    ];

    // Reset state whenever the source image prop changes
    useEffect(() => {
        setEditedImageDescription(null);
        setPrompt('');
        clearError();
    }, [image, clearError]);

    const handleGenerate = useCallback(async () => {
        if (!image || !prompt.trim()) {
            setError("Please upload an image and enter a prompt.");
            return;
        }
        setIsLoading(true);
        clearError();

        try {
            const result = await ollamaEditImage(image, prompt); // Using ollama service
            setEditedImageDescription(result); // Set text description
        } catch (err) {
            handleApiError(err, setError, 'edit');
        } finally {
            setIsLoading(false);
        }
    }, [image, prompt, setError, clearError]);

    return (
        <>
            <ControlsColumn>
                <UploadControl step={1} onImageUpload={onImageUpload} hasImage={!!image} />
                <PromptControl step={2} prompt={prompt} setPrompt={setPrompt} disabled={!image} placeholder="e.g., 'Add a retro cinematic filter'" examples={editorExamples} />
                <GenerateButton onClick={handleGenerate} disabled={!image || !prompt.trim() || isLoading} text={isLoading ? 'Editing...' : 'Generate Edit Description'} /> {/* Updated text */}
                 <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                    <p className="font-semibold text-gray-300">Note:</p>
                    <p>Ollama models currently provide a textual description of the image edit, not a modified image.</p>
                </div>
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative">
                    {isLoading && <Spinner text="Applying your edits..." />}
                    {!image && <UploadPlaceholder />}
                    {image && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                            <ImageDisplay title="Original" src={image} />
                            <ImageDisplay title="Edited" src={editedImageDescription} placeholder="Your edited image description will appear here" /> {/* Display text output */}
                        </div>
                    )}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageGeneratorView = ({ setError, clearError }: any) => {
    const [generatedImageDescription, setGeneratedImageDescription] = useState<string | null>(null); // Changed to description
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

     const generatorExamples = [
        'A cute robot holding a red balloon, 3D render',
        'Logo for a tech startup, minimalist, blue/white',
        'Oil painting of a stormy sea',
        'Photorealistic cup of coffee on a wooden desk'
    ];

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a prompt to generate an image description.");
            return;
        }
        setIsLoading(true);
        clearError();
        setGeneratedImageDescription(null);

        try {
            const result = await ollamaGenerateImage(prompt); // Using ollama service, removed aspectRatio
            setGeneratedImageDescription(result); // Set text description
        } catch (err) {
            handleApiError(err, setError, 'generate');
        } finally {
            setIsLoading(false);
        }
    }, [prompt, setError, clearError]);
    
    return (
        <>
            <ControlsColumn>
                <PromptControl step={1} prompt={prompt} setPrompt={setPrompt} placeholder="e.g., 'A vibrant oil painting of a cat wearing a wizard hat'" examples={generatorExamples} />
                 <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <StepIndicator step={2} />
                    <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Aspect Ratio (Not Supported)</h3>
                    <p className="text-sm text-gray-400">Ollama models currently generate textual descriptions of images and do not support explicit aspect ratio control.</p>
                </div>
                <GenerateButton onClick={handleGenerate} disabled={!prompt.trim() || isLoading} text={isLoading ? 'Generating...' : 'Generate Image Description'} /> {/* Updated text */}
                 <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                    <p className="font-semibold text-gray-300">Note:</p>
                    <p>Ollama models currently provide a textual description of the generated image, not the image itself.</p>
                </div>
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative h-full flex items-center justify-center">
                    {isLoading && <Spinner />}
                    {!generatedImageDescription && !isLoading && <div className="text-gray-500 text-center">Your generated image description will appear here</div>} {/* Updated text */}
                    {generatedImageDescription && <ImageDisplay src={generatedImageDescription} />} {/* Display text output */}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageAnalyzerView = ({ image, onImageUpload, setError, clearError }: any) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleAnalyze = useCallback(async () => {
        if (!image) {
            setError("Please upload an image to analyze.");
            return;
        }
        setIsLoading(true);
        clearError();
        setAnalysis('');
        try {
            const result = await ollamaAnalyzeImage(image); // Using ollama service
            setAnalysis(result);
        } catch (err) {
            handleApiError(err, setError, 'analyze');
        } finally {
            setIsLoading(false);
        }
    }, [image, setError, clearError]);

    return (
        <>
            <ControlsColumn>
                <UploadControl step={1} onImageUpload={onImageUpload} hasImage={!!image} />
                <GenerateButton onClick={handleAnalyze} disabled={!image || isLoading} text={isLoading ? 'Analyzing...' : 'Analyze Image'} />
                {analysis && !isLoading && (
                    <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 max-h-96 overflow-y-auto">
                         <h3 className="text-sm font-semibold text-gray-400 mb-2">Analysis Results</h3>
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

const ColorPaletteView = ({ setError, clearError }: any) => {
    const [paletteMode, setPaletteMode] = useState<'image' | 'theme'>('image');
    const [image, setImage] = useState<string | null>(null);
    const [themePrompt, setThemePrompt] = useState('');
    const [palette, setPalette] = useState<Color[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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
            const result = await ollamaGenerateColorPalette(source as any); // Using ollama service
            setPalette(result);
        } catch (err) {
            handleApiError(err, setError, 'palette generation');
        } finally {
            setIsLoading(false);
        }
    }, [paletteMode, image, themePrompt, setError, clearError]);

    return (
        <>
            <ControlsColumn>
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <StepIndicator step={1} />
                    <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Palette Source</h3>
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

// --- New Chat View ---
interface ChatMessage {
    type: 'user' | 'model';
    content: string;
    modelName?: string; // For model responses
    timestamp: string;
}


const OLLAMA_CHAT_MODELS = ['core', 'loop', '2244', 'coin', 'code']; // Define model pool

const ChatView = ({ chatHistory, isLoading, modelStatuses }: { chatHistory: ChatMessage[], isLoading: boolean, modelStatuses: Record<string, ModelStatus> }) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    return (
        <div className="flex-grow flex flex-col p-6 bg-gray-900 overflow-y-auto">
            {chatHistory.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                    <svg className="w-20 h-20 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-gray-400">Start a Multi-Model Chat</h3>
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


const PromptControl = ({ step, prompt, setPrompt, disabled = false, placeholder, examples = [] }: { step: number, prompt: string, setPrompt: (p: string) => void, disabled?: boolean, placeholder?: string, examples?: string[] }) => (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <StepIndicator step={step} />
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
    const hasImage = src && src.startsWith('data:image');
    const isTextOutput = src && !hasImage; // If src exists but isn't a data URL, assume it's text

    return (
        <div className="bg-gray-800/50 rounded-lg p-3 flex flex-col border border-gray-700 h-full">
            {title && <h3 className="text-md font-semibold text-gray-300 mb-2">{title}</h3>}
            <div className="flex-grow flex items-center justify-center relative min-h-[200px] text-gray-300">
                {hasImage ? (
                     <img src={src} alt={title || 'Generated or edited content'} className="max-w-full max-h-full object-contain rounded-md" />
                ) : isTextOutput ? (
                    <p className="whitespace-pre-wrap text-sm p-2 bg-gray-900 rounded-md max-h-full overflow-y-auto w-full text-left">{src}</p> // Display text
                ) : (
                    <p className="text-gray-500">{placeholder}</p>
                )}
            </div>
             {hasImage && download && (
                <a
                    href={src}
                    download="ollama-creation.png" // Changed filename
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

type AppMode = 'edit' | 'generate' | 'analyze' | 'palette' | 'chat';

export default function App() {
    const [mode, setMode] = useState<AppMode>('edit');
    const [image, setImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [currentChatPrompt, setCurrentChatPrompt] = useState<string>('');
    const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
    const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>(
        Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'idle']))
    );

    const clearError = useCallback(() => setError(null), []);

    const handleImageUpload = (imageDataUrl: string) => {
        setImage(imageDataUrl);
        clearError();
    };

    const handleSendMessage = useCallback(async () => {
        if (!currentChatPrompt.trim()) return;

        const userMessage: ChatMessage = {
            type: 'user',
            content: currentChatPrompt,
            timestamp: new Date().toLocaleTimeString(),
        };
        setChatHistory(prev => [...prev, userMessage]);
        setCurrentChatPrompt('');
        setIsChatLoading(true);
        clearError();

        // Reset model statuses to processing
        setModelStatuses(
            Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'processing']))
        );

        try {
            const results = await ollamaGenerateContentMultiModel(OLLAMA_CHAT_MODELS, currentChatPrompt, (modelName, status) => {
                setModelStatuses(prev => ({ ...prev, [modelName]: status }));
            });

            // Combine results into a single "fused" response
            const fusedResponseContent = results.map(res => {
                if (res.status === 'success') {
                    return `**${res.modelName}:**\n${res.response}`;
                } else {
                    return `**${res.modelName} (Error):**\nFailed to get response: ${res.error || 'Unknown error'}`;
                }
            }).join('\n\n---\n\n');

            const modelMessage: ChatMessage = {
                type: 'model',
                content: fusedResponseContent,
                timestamp: new Date().toLocaleTimeString(),
                modelName: 'Ollama Pool', // Indicating it's a combined response
            };
            setChatHistory(prev => [...prev, modelMessage]);

        } catch (err) {
            handleApiError(err, setError, 'multi-model chat');
            // Set all models to error if a global orchestrator error occurs
            setModelStatuses(
                Object.fromEntries(OLLAMA_CHAT_MODELS.map(model => [model, 'error']))
            );
        } finally {
            setIsChatLoading(false);
            // After all processing, ensure models are set to idle if not already in error state
            setModelStatuses(prev => {
                const newStatuses = { ...prev };
                for (const model of OLLAMA_CHAT_MODELS) {
                    if (newStatuses[model] === 'processing') {
                        newStatuses[model] = 'idle';
                    }
                }
                return newStatuses;
            });
        }
    }, [currentChatPrompt, clearError, setError]);

    const renderView = () => {
        switch (mode) {
            case 'edit':
                return <ImageEditorView image={image} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} />;
            case 'generate':
                return <ImageGeneratorView setError={setError} clearError={clearError} />;
            case 'analyze':
                 return <ImageAnalyzerView image={image} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} />;
            case 'palette':
                return <ColorPaletteView setError={setError} clearError={clearError} />;
            case 'chat':
                return <ChatView chatHistory={chatHistory} isLoading={isChatLoading} modelStatuses={modelStatuses} />;
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-900 text-white h-screen flex flex-col font-sans">
            <Header />
            <div className="flex flex-grow pt-16 h-full overflow-hidden">
                <aside className="w-64 bg-gray-800/30 p-4 border-r border-gray-700 flex flex-col space-y-4">
                    <h2 className="text-lg font-semibold text-gray-300">Tools</h2>
                    <nav className="flex flex-col space-y-2">
                        <ModeButton mode="edit" currentMode={mode} setMode={setMode} text="Image Editor (Text Output)" />
                        <ModeButton mode="generate" currentMode={mode} setMode={setMode} text="Image Generator (Text Output)" />
                        <ModeButton mode="analyze" currentMode={mode} setMode={setMode} text="Image Analyzer" />
                        <ModeButton mode="palette" currentMode={mode} setMode={setMode} text="Color Palette" />
                        <ModeButton mode="chat" currentMode={mode} setMode={setMode} text="Multi-Model Chat" />
                    </nav>
                    <div className="mt-auto p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                        <p className="font-semibold text-gray-300">Tip:</p>
                        <p>Ensure Ollama is running locally with the 'llava' model downloaded for image tasks. For chat, ensure all models in the pool (core, loop, 2244, coin, code) are available.</p>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {renderView()}
                    {/* Sticky input field at the bottom */}
                    <div className="bg-gray-800/50 p-4 border-t border-gray-700 flex flex-col items-center">
                        <div className="flex flex-wrap justify-center gap-2 mb-3">
                            {OLLAMA_CHAT_MODELS.map(model => (
                                <div key={model} className="flex items-center space-x-1">
                                    <span 
                                        className={`w-3 h-3 rounded-full 
                                            ${modelStatuses[model] === 'processing' ? 'bg-cyan-500 animate-pulse' : ''}
                                            ${modelStatuses[model] === 'success' ? 'bg-green-500' : ''}
                                            ${modelStatuses[model] === 'error' ? 'bg-red-500' : ''}
                                            ${modelStatuses[model] === 'idle' ? 'bg-gray-500' : ''}
                                            `}
                                        title={`Model ${model} is ${modelStatuses[model]}`}
                                    ></span>
                                    <span className="text-xs text-gray-400">{model}</span>
                                </div>
                            ))}
                        </div>
                        <div className="w-full max-w-4xl flex items-center space-x-2">
                            <textarea
                                value={currentChatPrompt}
                                onChange={(e) => setCurrentChatPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !isChatLoading) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                disabled={isChatLoading}
                                placeholder="Type your message here..."
                                className="flex-grow h-auto max-h-32 min-h-[40px] p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 resize-y"
                                aria-label="Natural prompt text input"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={isChatLoading || !currentChatPrompt.trim()}
                                className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 disabled:opacity-50"
                            >
                                Send
                            </button>
                        </div>
                    </div>
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