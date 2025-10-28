
import React, { useState, useRef, useCallback } from 'react';
import { editImage } from './services/geminiService';

// --- UI Components (defined outside App to prevent re-renders) ---

const Header = () => (
    <header className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 fixed top-0 left-0 right-0 z-30">
        <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
                 <svg className="w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h1 className="text-xl font-bold text-white tracking-wider">Gemini Image Editor</h1>
            </div>
        </div>
    </header>
);

const Spinner = () => (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center rounded-lg z-20">
        <div className="flex flex-col items-center text-center p-4">
             <svg className="animate-spin h-10 w-10 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-lg text-gray-300 font-semibold">Gemini is working its magic...</p>
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


export default function App() {
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [editedImage, setEditedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setOriginalImage(reader.result as string);
                setEditedImage(null);
                setError(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleGenerate = useCallback(async () => {
        if (!originalImage || !prompt.trim()) {
            setError("Please upload an image and enter a prompt.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setEditedImage(null);

        try {
            const result = await editImage(originalImage, prompt);
            setEditedImage(result);
        } catch (err) {
            const rawMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
            console.error("Generation failed:", err); // For debugging purposes

            let displayMessage: string;
            const lowerCaseMessage = rawMessage.toLowerCase();

            if (lowerCaseMessage.includes('api key')) {
                displayMessage = "There is an issue with the API configuration. Please contact the administrator.";
            } else if (lowerCaseMessage.includes('fetch failed') || lowerCaseMessage.includes('network error')) {
                displayMessage = "Network connection failed. Please check your internet connection and try again.";
            } else if (lowerCaseMessage.includes('invalid data url')) {
                displayMessage = "The uploaded image format is not supported. Please try a different image (e.g., PNG or JPEG).";
            } else if (lowerCaseMessage.includes('no image was returned')) {
                displayMessage = "The AI was unable to process this request. The prompt may be too complex or violate safety policies. Please try rephrasing it.";
            } else if (lowerCaseMessage.includes('quota')) {
                displayMessage = "The service is currently at capacity (quota exceeded). Please try again later.";
            } else {
                // Generic fallback that still tries to be user-friendly by cleaning the message
                const cleanedMessage = rawMessage.replace("Failed to edit image:", "").trim();
                displayMessage = `An error occurred: ${cleanedMessage || 'Please try again.'}`;
            }
            
            setError(displayMessage);
        } finally {
            setIsLoading(false);
        }
    }, [originalImage, prompt]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <Header />
            <main className="pt-24 pb-12 container mx-auto px-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* --- Column 1: Controls --- */}
                    <div className="lg:col-span-4 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700 flex flex-col space-y-6 h-fit sticky top-24">
                        <div>
                            <h2 className="text-lg font-semibold mb-3 text-cyan-400 flex items-center space-x-2">
                                <span className="flex items-center justify-center w-6 h-6 bg-cyan-500 text-gray-900 rounded-full font-bold text-sm">1</span>
                                <span>Upload Image</span>
                            </h2>
                            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/png, image/jpeg, image/webp"/>
                            <button onClick={triggerFileUpload} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out flex items-center justify-center space-x-2 border border-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                <span>{originalImage ? 'Change Image' : 'Select an Image'}</span>
                            </button>
                            {originalImage && <p className="text-xs text-center mt-2 text-green-400">Image loaded successfully.</p>}
                        </div>
                        
                        <div>
                            <h2 className="text-lg font-semibold mb-3 text-cyan-400 flex items-center space-x-2">
                                <span className="flex items-center justify-center w-6 h-6 bg-cyan-500 text-gray-900 rounded-full font-bold text-sm">2</span>
                                <span>Describe Your Edit</span>
                            </h2>
                            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., 'Add a retro cinematic filter' or 'Make the background a futuristic city at night'" className="w-full h-32 p-3 bg-gray-900 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition duration-200 resize-none disabled:opacity-50" disabled={!originalImage}/>
                        </div>

                        <button onClick={handleGenerate} disabled={!originalImage || !prompt.trim() || isLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out text-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            {isLoading ? 'Generating...' : 'Generate Edit'}
                        </button>
                        
                        {error && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg text-sm" role="alert">
                                <p className="font-semibold">An error occurred</p>
                                <p>{error}</p>
                            </div>
                        )}
                    </div>

                    {/* --- Column 2: Image Display --- */}
                    <div className="lg:col-span-8 bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700 min-h-[60vh] flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 text-cyan-400">Result</h2>
                        <div className="flex-grow relative">
                            {isLoading && <Spinner />}
                            {!originalImage && <UploadPlaceholder />}
                            {originalImage && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                                    <div className="flex flex-col items-center space-y-2">
                                        <h3 className="text-md font-medium text-gray-400">Original</h3>
                                        <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center overflow-hidden">
                                            <img src={originalImage} alt="Original" className="max-w-full max-h-full object-contain"/>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center space-y-2">
                                        <h3 className="text-md font-medium text-gray-400">Edited</h3>
                                        <div className="w-full aspect-square bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden p-1">
                                            {editedImage ? (
                                                <img src={editedImage} alt="Edited" className="max-w-full max-h-full object-contain"/>
                                            ) : (
                                                <span className="text-gray-500 text-center p-4">Your edited image will appear here</span>
                                            )}
                                        </div>
                                        {editedImage && (
                                            <a href={editedImage} download="edited-image.png" className="mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition duration-300">
                                                Download
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
