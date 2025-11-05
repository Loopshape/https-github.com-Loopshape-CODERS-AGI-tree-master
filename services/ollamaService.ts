// Fix: Define and export the Color interface here to resolve the circular dependency and export error.
export interface Color {
    hex: string;
    name: string;
}

const OLLAMA_HOST = 'http://localhost:11434'; // Default Ollama server address
const OLLAMA_MODEL = 'llava'; // Assuming LLaVA model is used for multimodal tasks by default

/**
 * Helper to extract raw base64 data from a data URL string.
 * Ollama expects base64 without the 'data:mime/type;base64,' prefix.
 * @param dataUrl The data URL (e.g., "data:image/jpeg;base64,...").
 * @returns The raw base64 string.
 */
const dataUrlToBase64 = (dataUrl: string): string => {
    const regex = /^data:(.+);base64,(.*)$/;
    const match = dataUrl.match(regex);
    if (!match) {
        throw new Error("Invalid data URL format");
    }
    return match[2]; // Return only the base64 part
};

/**
 * Interface for Ollama's /api/generate request body.
 */
interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    images?: string[]; // base64 without prefix
    stream?: boolean;
    format?: 'json'; // Optional, for structured JSON output
}

/**
 * Interface for Ollama's /api/generate response.
 */
interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    // ... other metadata fields
}

export type ModelStatus = 'idle' | 'processing' | 'success' | 'error';

/**
 * Generic helper to send requests to Ollama's /api/generate endpoint.
 * @param prompt The text prompt for the model.
 * @param images An array of base64 image strings (without data URL prefix).
 * @param format Optional format parameter (e.g., 'json') to request structured output.
 * @param modelName Optional model name to target. Defaults to OLLAMA_MODEL.
 * @returns A promise that resolves to the model's text response.
 */
export const ollamaGenerateContent = async (
    prompt: string,
    images: string[] = [],
    format?: 'json',
    modelName: string = OLLAMA_MODEL, // Added modelName parameter
): Promise<string> => {
    const requestBody: OllamaGenerateRequest = {
        model: modelName,
        prompt: prompt,
        images: images,
        stream: false, // Ensure we get a single complete response
    };

    if (format) {
        requestBody.format = format;
    }

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${modelName}): ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: OllamaGenerateResponse = await response.json();
        return data.response;

    } catch (error) {
        // Enhance network error messages for better user guidance
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            throw new Error(`Network error (${modelName}): Could not connect to Ollama server at ${OLLAMA_HOST}. Please ensure Ollama is running and accessible.`);
        }
        throw error;
    }
};

/**
 * Sends a prompt to multiple Ollama models concurrently and returns their responses.
 * @param modelNames An array of Ollama model names to query.
 * @param prompt The text prompt for the models.
 * @param onModelStatusUpdate Callback to update the status of individual models.
 * @returns A promise that resolves to an array of results, each including modelName, status ('success' or 'error'), response (if successful), and error (if failed).
 */
export const ollamaGenerateContentMultiModel = async (
    modelNames: string[],
    prompt: string,
    onModelStatusUpdate: (modelName: string, status: ModelStatus) => void,
): Promise<{ modelName: string; status: ModelStatus; response?: string; error?: string }[]> => {
    const promises = modelNames.map(async (modelName) => {
        onModelStatusUpdate(modelName, 'processing');
        try {
            const response = await ollamaGenerateContent(prompt, [], undefined, modelName);
            onModelStatusUpdate(modelName, 'success');
            return { modelName, status: 'success' as ModelStatus, response };
        } catch (error: any) {
            onModelStatusUpdate(modelName, 'error');
            return { modelName, status: 'error' as ModelStatus, error: error.message || 'Unknown error' };
        }
    });

    return Promise.all(promises);
};


/**
 * Sends an image and a text prompt to Ollama to get a textual description of an edited image.
 * Ollama models like LLaVA primarily output text, not modified images.
 * @param originalImageDataUrl The original image as a data URL.
 * @param prompt The text prompt describing the desired edit.
 * @returns A promise that resolves to a text description of the edited image.
 */
export const ollamaEditImage = async (
    originalImageDataUrl: string,
    prompt: string
): Promise<string> => {
    try {
        const base64Data = dataUrlToBase64(originalImageDataUrl);
        const ollamaPrompt = `You are an image editor. Based on the provided image, apply the following change: "${prompt}". Describe the resulting image after this edit in detail.`;
        const resultText = await ollamaGenerateContent(ollamaPrompt, [base64Data]);
        return resultText; // Returns text description
    } catch (error) {
        console.error("Error editing image with Ollama:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to edit image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while editing the image.");
    }
};

/**
 * Generates a textual description of an image based on a prompt using Ollama.
 * Ollama models like LLaVA primarily output text, not images.
 * Aspect ratio is not directly supported for text generation output.
 * @param prompt The text prompt describing the desired image.
 * @returns A promise that resolves to a text description of the generated image.
 */
export const ollamaGenerateImage = async (
    prompt: string,
): Promise<string> => {
    try {
        const ollamaPrompt = `Generate an image based on this description: "${prompt}". Describe the generated image in vivid detail, as if you are seeing it.`;
        const resultText = await ollamaGenerateContent(ollamaPrompt);
        return resultText; // Returns text description
    } catch (error) {
        console.error("Error generating image with Ollama:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the image.");
    }
};

/**
 * Analyzes an image using Ollama and returns a text description.
 * @param imageDataUrl The image to analyze as a data URL.
 * @returns A promise that resolves to the text analysis of the image.
 */
export const ollamaAnalyzeImage = async (imageDataUrl: string): Promise<string> => {
    try {
        const base64Data = dataUrlToBase64(imageDataUrl);
        const ollamaPrompt = "Describe this image in detail. Be thorough and helpful.";
        const resultText = await ollamaGenerateContent(ollamaPrompt, [base64Data]);
        return resultText;
    } catch (error) {
        console.error("Error analyzing image with Ollama:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to analyze image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while analyzing the image.");
    }
};


/**
 * Generates a color palette from an image or a text description using Ollama.
 * Expects Ollama to return a JSON string in the format { "palette": [{ "hex": "#RRGGBB", "name": "Color Name" }, ...] }.
 * @param source An object containing either an `image` data URL or a `text` prompt.
 * @returns A promise that resolves to an array of Color objects.
 */
export const ollamaGenerateColorPalette = async (
    source: { image?: string; text?: string }
): Promise<Color[]> => {
    if (!source.image && !source.text) {
        throw new Error("Either an image or a text prompt must be provided.");
    }

    try {
        let ollamaPrompt = "";
        let images: string[] = [];

        if (source.image) {
            images.push(dataUrlToBase64(source.image));
            ollamaPrompt = "Extract a 5-color palette from this image. Provide descriptive names and hex codes for each color. Respond in JSON format with a 'palette' array, each object having 'hex' and 'name' properties.";
        } else if (source.text) {
            ollamaPrompt = `Generate a 5-color palette based on the theme: "${source.text}". Provide creative, descriptive names and hex codes for each color. Respond in JSON format with a 'palette' array, each object having 'hex' and 'name' properties.`;
        }
        
        const rawJsonResponse = await ollamaGenerateContent(ollamaPrompt, images, 'json');
        const jsonResponse = JSON.parse(rawJsonResponse);

        if (jsonResponse.palette && Array.isArray(jsonResponse.palette)) {
            return jsonResponse.palette.map((c: any) => ({
                hex: c.hex,
                name: c.name,
            }));
        } else {
            // Fallback for unexpected JSON structure
            throw new Error("Ollama did not return a valid color palette in the expected JSON format. Ensure the model follows the JSON instruction.");
        }

    } catch (error) {
        console.error("Error generating color palette with Ollama:", error);
        if (error instanceof Error) {
            // Check if the error is due to JSON parsing failure
            if (error.message.includes("Unexpected token") || error.message.includes("JSON")) {
                throw new Error(`Failed to parse Ollama's response as JSON for palette generation. The model might not have adhered to the JSON format instruction. Raw error: ${error.message}`);
            }
            throw new Error(`Failed to generate palette: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the palette.");
    }
};