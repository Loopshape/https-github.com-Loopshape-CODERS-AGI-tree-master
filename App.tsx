import React, { useState, useRef, useCallback, useEffect } from 'react';
import { editImage, generateImage, analyzeImage, generateColorPalette, Color } from './services/geminiService';

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
                <h1 className="text-xl font-bold text-white tracking-wider">Gemini Creative Suite</h1>
            </div>
        </div>
    </header>
);

const Spinner = ({ text = "Gemini is working its magic..." }) => (
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

const UndoRedoControl = ({ onUndo, onRedo, canUndo, canRedo }: { onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; }) => (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 mb-3 text-center">History</h3>
        <div className="flex items-center justify-center space-x-4">
            <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 transition-all"
                aria-label="Undo last edit"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8A5 5 0 009 9V5" /></svg>
                <span>Undo</span>
            </button>
            <button
                onClick={onRedo}
                disabled={!canRedo}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 transition-all"
                aria-label="Redo last edit"
            >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 15l3-3m0 0l-3-3m3 3H5a5 5 0 010-10h2" /></svg>
                <span>Redo</span>
            </button>
        </div>
    </div>
);


const handleApiError = (err: unknown, setError: (message: string) => void, action: string) => {
    const rawMessage = err instanceof Error ? err.message : `An unexpected error occurred during ${action}.`;
    console.error(`${action} failed:`, err);

    let displayMessage: string;
    const lowerCaseMessage = rawMessage.toLowerCase();

    if (lowerCaseMessage.includes('api key')) {
        displayMessage = "API configuration issue. Please contact the administrator.";
    } else if (lowerCaseMessage.includes('fetch failed') || lowerCaseMessage.includes('network error')) {
        displayMessage = "Network connection failed. Please check your internet and try again.";
    } else if (lowerCaseMessage.includes('invalid data url')) {
        displayMessage = "Unsupported image format. Please try a PNG or JPEG.";
    } else if (lowerCaseMessage.includes('no image was returned')) {
        displayMessage = "The AI was unable to process this request. The prompt may be too complex or violate safety policies.";
    } else if (lowerCaseMessage.includes('quota')) {
        displayMessage = "The service is at capacity (quota exceeded). Please try again later.";
    } else {
        const cleanedMessage = rawMessage.replace(/Failed to .*?:/, "").trim();
        displayMessage = `An error occurred: ${cleanedMessage || 'Please try again.'}`;
    }
    setError(displayMessage);
};

// --- Feature Views ---

const ImageEditorView = ({ image, onImageUpload, clearError, setError }: any) => {
    const [editedImage, setEditedImage] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<string[]>([]);
    const [redoStack, setRedoStack] = useState<string[]>([]);
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
        setEditedImage(null);
        setUndoStack([]);
        setRedoStack([]);
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
            const result = await editImage(image, prompt);
            
            // Add current state to undo stack before updating
            if (editedImage) {
                setUndoStack(prev => [...prev, editedImage]);
            } else {
                setUndoStack(prev => [...prev, image]); // save original on first edit
            }
            setEditedImage(result);
            setRedoStack([]); // A new edit action clears the redo history
        } catch (err) {
            handleApiError(err, setError, 'edit');
        } finally {
            setIsLoading(false);
        }
    }, [image, prompt, setError, clearError, editedImage]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;

        const lastImage = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));

        if (editedImage) {
             setRedoStack(prev => [editedImage, ...prev]);
        }
       
        setEditedImage(lastImage);
    }, [undoStack, editedImage]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;

        const nextImage = redoStack[0];
        setRedoStack(prev => prev.slice(1));

        if (editedImage) {
            setUndoStack(prev => [...prev, editedImage]);
        }

        setEditedImage(nextImage);
    }, [redoStack, editedImage]);

    return (
        <>
            <ControlsColumn>
                <UploadControl step={1} onImageUpload={onImageUpload} hasImage={!!image} />
                <PromptControl step={2} prompt={prompt} setPrompt={setPrompt} disabled={!image} placeholder="e.g., 'Add a retro cinematic filter'" examples={editorExamples} />
                <UndoRedoControl onUndo={handleUndo} onRedo={handleRedo} canUndo={undoStack.length > 1 || (undoStack.length > 0 && editedImage !== image)} canRedo={redoStack.length > 0} />
                <GenerateButton onClick={handleGenerate} disabled={!image || !prompt.trim() || isLoading} text={isLoading ? 'Editing...' : 'Generate Edit'} />
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative">
                    {isLoading && <Spinner text="Applying your edits..." />}
                    {!image && <UploadPlaceholder />}
                    {image && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                            <ImageDisplay title="Original" src={image} />
                            <ImageDisplay title="Edited" src={editedImage ?? image} placeholder="Your edited image will appear here" download />
                        </div>
                    )}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageGeneratorView = ({ setError, clearError }: any) => {
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
    const [isLoading, setIsLoading] = useState<boolean>(false);

     const generatorExamples = [
        'A cute robot holding a red balloon, 3D render',
        'Logo for a tech startup, minimalist, blue/white',
        'Oil painting of a stormy sea',
        'Photorealistic cup of coffee on a wooden desk'
    ];

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a prompt to generate an image.");
            return;
        }
        setIsLoading(true);
        clearError();
        setGeneratedImage(null);

        try {
            const result = await generateImage(prompt, aspectRatio);
            setGeneratedImage(result);
        } catch (err) {
            handleApiError(err, setError, 'generate');
        } finally {
            setIsLoading(false);
        }
    }, [prompt, aspectRatio, setError, clearError]);
    
    return (
        <>
            <ControlsColumn>
                <PromptControl step={1} prompt={prompt} setPrompt={setPrompt} placeholder="e.g., 'A vibrant oil painting of a cat wearing a wizard hat'" examples={generatorExamples} />
                <AspectRatioControl step={2} value={aspectRatio} onChange={setAspectRatio} />
                <GenerateButton onClick={handleGenerate} disabled={!prompt.trim() || isLoading} text={isLoading ? 'Generating...' : 'Generate Image'} />
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative h-full flex items-center justify-center">
                    {isLoading && <Spinner />}
                    {!generatedImage && !isLoading && <div className="text-gray-500 text-center">Your generated image will appear here</div>}
                    {generatedImage && <ImageDisplay src={generatedImage} download />}
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
            const result = await analyzeImage(image);
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
            const result = await generateColorPalette(source as any);
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

// --- Control Primitives ---

const ControlsColumn = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full md:w-80 lg:w-96 bg-gray-900/50 backdrop-blur-sm border-r border-gray-700 p-4 flex flex-col space-y-4 overflow-y-auto">
        {children}
    </div>
);

const ResultColumn = ({ children }: { children: React.ReactNode }) => (
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

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => onImageUpload(e.target?.result as string);
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
                className="w-full bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50"
            >
                {hasImage ? "Select New File" : "Choose a File"}
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

const AspectRatioControl = ({ step, value, onChange }: { step: number; value: string; onChange: (v: '1:1' | '16:9' | '9:16' | '4:3' | '3:4') => void }) => {
    const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
    return (
         <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <StepIndicator step={step} />
            <h3 className="text-lg font-semibold text-gray-200 mt-3 mb-2">Aspect Ratio</h3>
            <div className="grid grid-cols-3 gap-2">
                {ratios.map(ratio => (
                    <button
                        key={ratio}
                        onClick={() => onChange(ratio)}
                        className={`py-2 px-1 text-sm rounded-md transition-colors ${value === ratio ? 'bg-cyan-600 text-white font-bold' : 'bg-gray-700 hover:bg-gray-600'}`}
                        aria-label={`Set aspect ratio to ${ratio}`}
                        aria-pressed={value === ratio}
                    >
                        {ratio}
                    </button>
                ))}
            </div>
        </div>
    );
};

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
    return (
        <div className="bg-gray-800/50 rounded-lg p-3 flex flex-col border border-gray-700 h-full">
            {title && <h3 className="text-md font-semibold text-gray-300 mb-2">{title}</h3>}
            <div className="flex-grow flex items-center justify-center relative min-h-[200px]">
                {hasImage ? (
                     <img src={src} alt={title || 'Generated or edited content'} className="max-w-full max-h-full object-contain rounded-md" />
                ) : (
                    <p className="text-gray-500">{placeholder}</p>
                )}
            </div>
             {hasImage && download && (
                <a
                    href={src}
                    download="gemini-creation.png"
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

    // Simple function to determine if a color is light or dark for text contrast
    const getTextColor = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? 'text-gray-900' : 'text-white';
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

type AppMode = 'edit' | 'generate' | 'analyze' | 'palette';

export default function App() {
    const [mode, setMode] = useState<AppMode>('edit');
    const [image, setImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const clearError = useCallback(() => setError(null), []);

    const handleImageUpload = (imageDataUrl: string) => {
        setImage(imageDataUrl);
        clearError();
    };

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
                        <ModeButton mode="edit" currentMode={mode} setMode={setMode} text="Image Editor" />
                        <ModeButton mode="generate" currentMode={mode} setMode={setMode} text="Image Generator" />
                        <ModeButton mode="analyze" currentMode={mode} setMode={setMode} text="Image Analyzer" />
                        <ModeButton mode="palette" currentMode={mode} setMode={setMode} text="Color Palette" />
                    </nav>
                    <div className="mt-auto p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-sm text-gray-400">
                        <p className="font-semibold text-gray-300">Tip:</p>
                        <p>For best results, use clear and descriptive prompts.</p>
                    </div>
                </aside>

                <div className="flex-1 flex overflow-hidden">
                    {renderView()}
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