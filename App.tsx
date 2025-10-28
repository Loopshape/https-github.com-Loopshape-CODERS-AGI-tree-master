
import React, { useState, useRef, useCallback } from 'react';
import { editImage, generateImage, analyzeImage } from './services/geminiService';

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

const handleApiError = (err: unknown, setError: (message: string) => void, action: 'edit' | 'generate' | 'analyze') => {
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
        const cleanedMessage = rawMessage.replace(`Failed to ${action} image:`, "").trim();
        displayMessage = `An error occurred: ${cleanedMessage || 'Please try again.'}`;
    }
    setError(displayMessage);
};

// --- Feature Views ---

const ImageEditorView = ({ image, onImageUpload, clearError, setError }) => {
    const [editedImage, setEditedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleGenerate = useCallback(async () => {
        if (!image || !prompt.trim()) {
            setError("Please upload an image and enter a prompt.");
            return;
        }
        setIsLoading(true);
        clearError();
        setEditedImage(null);

        try {
            const result = await editImage(image, prompt);
            setEditedImage(result);
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
                <PromptControl step={2} prompt={prompt} setPrompt={setPrompt} disabled={!image} placeholder="e.g., 'Add a retro cinematic filter'"/>
                <GenerateButton onClick={handleGenerate} disabled={!image || !prompt.trim() || isLoading} text={isLoading ? 'Editing...' : 'Generate Edit'} />
            </ControlsColumn>
            <ResultColumn>
                 <div className="flex-grow relative">
                    {isLoading && <Spinner text="Applying your edits..." />}
                    {!image && <UploadPlaceholder />}
                    {image && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                            <ImageDisplay title="Original" src={image} />
                            <ImageDisplay title="Edited" src={editedImage} placeholder="Your edited image will appear here" download />
                        </div>
                    )}
                </div>
            </ResultColumn>
        </>
    );
};

const ImageGeneratorView = ({ setError, clearError }) => {
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
    const [isLoading, setIsLoading] = useState<boolean>(false);

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
                <PromptControl step={1} prompt={prompt} setPrompt={setPrompt} placeholder="e.g., 'A vibrant oil painting of a cat wearing a wizard hat'"/>
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

const ImageAnalyzerView = ({ image, onImageUpload, setError, clearError }) => {
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
            </ControlsColumn>
            <ResultColumn>
                <div className="flex flex-col md:flex-row gap-6 h-full">
                    <div className="w-full md:w-1/2 relative">
                        {!image && <UploadPlaceholder />}
                        {image && <ImageDisplay src={image} />}
                    </div>
                    <div className="w-full md:w-1/2 relative">
                        <h3 className="text-md font-medium text-gray-400 mb-2">Analysis Result</h3>
                        <div className="h-96 bg-gray-900/50 rounded-lg border border-gray-600 p-4 overflow-y-auto relative">
                            {isLoading && <Spinner text="Analyzing image..." />}
                            {analysis ? <p className="whitespace-pre-wrap text-gray-300">{analysis}</p> : <span className="text-gray-500">Analysis will appear here.</span>}
                        </div>
                    </div>
                </div>
            </ResultColumn>
        </>
    );
};

// --- Reusable Control & Layout Components ---

const ControlsColumn = ({ children }) => (
    <div className="lg:col-span-4 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700 flex flex-col space-y-6 h-fit sticky top-24">
        {children}
    </div>
);

const ResultColumn = ({ children }) => (
    <div className="lg:col-span-8 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700 min-h-[60vh] flex flex-col">
        {children}
    </div>
);

const UploadControl = ({ step, onImageUpload, hasImage }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    return (
        <div>
            <h2 className="text-lg font-semibold mb-3 text-cyan-400 flex items-center space-x-2">
                <span className="flex items-center justify-center w-6 h-6 bg-cyan-500 text-gray-900 rounded-full font-bold text-sm">{step}</span>
                <span>Upload Image</span>
            </h2>
            <input type="file" ref={fileInputRef} onChange={onImageUpload} className="hidden" accept="image/png, image/jpeg, image/webp"/>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out flex items-center justify-center space-x-2 border border-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                <span>{hasImage ? 'Change Image' : 'Select an Image'}</span>
            </button>
            {hasImage && <p className="text-xs text-center mt-2 text-green-400">Image loaded successfully.</p>}
        </div>
    );
};

const PromptControl = ({ step, prompt, setPrompt, placeholder, disabled=false }) => (
     <div>
        <h2 className="text-lg font-semibold mb-3 text-cyan-400 flex items-center space-x-2">
            <span className="flex items-center justify-center w-6 h-6 bg-cyan-500 text-gray-900 rounded-full font-bold text-sm">{step}</span>
            <span>Describe Your Request</span>
        </h2>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={placeholder} className="w-full h-32 p-3 bg-gray-900 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition duration-200 resize-none disabled:opacity-50" disabled={disabled}/>
    </div>
);

const AspectRatioControl = ({ step, value, onChange }) => {
    const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    return (
        <div>
            <h2 className="text-lg font-semibold mb-3 text-cyan-400 flex items-center space-x-2">
                <span className="flex items-center justify-center w-6 h-6 bg-cyan-500 text-gray-900 rounded-full font-bold text-sm">{step}</span>
                <span>Choose Aspect Ratio</span>
            </h2>
            <div className="grid grid-cols-3 gap-2">
                {ratios.map(ratio => (
                    <button key={ratio} onClick={() => onChange(ratio)} className={`p-2 rounded-lg text-sm font-semibold transition ${value === ratio ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{ratio}</button>
                ))}
            </div>
        </div>
    );
}

const GenerateButton = ({ onClick, disabled, text }) => (
    <button onClick={onClick} disabled={disabled} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out text-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
        {text}
    </button>
);

const ImageDisplay = ({ title, src, placeholder, download=false }) => (
     <div className="flex flex-col items-center space-y-2 h-full">
        {title && <h3 className="text-md font-medium text-gray-400">{title}</h3>}
        <div className="w-full flex-grow aspect-square bg-black rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-700">
            {src ? (
                <img src={src} alt={title || 'Generated content'} className="max-w-full max-h-full object-contain"/>
            ) : (
                placeholder && <span className="text-gray-500 text-center p-4">{placeholder}</span>
            )}
        </div>
        {src && download && (
             <a href={src} download="gemini-image.png" className="mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition duration-300">
                Download
            </a>
        )}
    </div>
);

const TabButton = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        role="tab"
        aria-selected={isActive}
        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
            isActive
                ? 'bg-cyan-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
        }`}
    >
        {label}
    </button>
);


// --- Main App Component ---

export default function App() {
    type Tab = 'edit' | 'generate' | 'analyze';
    const [activeTab, setActiveTab] = useState<Tab>('edit');
    const [sharedImage, setSharedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSharedImage(reader.result as string);
                setError(null);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const clearError = useCallback(() => setError(null), []);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'edit':
                return <ImageEditorView image={sharedImage} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} />;
            case 'generate':
                return <ImageGeneratorView setError={setError} clearError={clearError} />;
            case 'analyze':
                return <ImageAnalyzerView image={sharedImage} onImageUpload={handleImageUpload} setError={setError} clearError={clearError} />;
            default:
                return null;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <Header />
            <main className="pt-24 pb-12 container mx-auto px-4">
                 <div className="mb-8" role="tablist" aria-label="Creative Modes">
                    <div className="flex items-center space-x-2 bg-gray-800/50 border border-gray-700 p-2 rounded-lg max-w-md mx-auto">
                        <TabButton label="Image Editor" isActive={activeTab === 'edit'} onClick={() => setActiveTab('edit')} />
                        <TabButton label="Image Generator" isActive={activeTab === 'generate'} onClick={() => setActiveTab('generate')} />
                        <TabButton label="Image Analyzer" isActive={activeTab === 'analyze'} onClick={() => setActiveTab('analyze')} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                   {renderTabContent()}
                </div>
                 {error && (
                    <div className="fixed bottom-4 right-4 max-w-sm w-full z-50">
                        <ErrorDisplay error={error} onClear={clearError} />
                    </div>
                 )}
            </main>
        </div>
    );
}
