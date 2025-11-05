import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

// Initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to extract raw base64 data from a data URL string.
 * Gemini API expects base64 without the 'data:mime/type;base64,' prefix.
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
 * Interface for a color object, shared with Ollama service.
 */
export interface Color {
    hex: string;
    name: string;
}

export interface GenerateTextResult {
    text: string;
    groundingChunks?: Array<any>;
}

/**
 * Generates text content using various Gemini models, with optional system instruction, thinking mode, and search grounding.
 * @param prompt The text prompt.
 * @param model The Gemini model name (e.g., 'gemini-2.5-flash', 'gemini-2.5-pro').
 * @param systemInstruction Optional system instruction for the model.
 * @param thinkingBudget Optional thinking budget for 'gemini-2.5-pro' models.
 * @param enableSearch Optional flag to enable Google Search grounding.
 * @returns A promise that resolves to the generated text and any grounding chunks.
 */
export const geminiGenerateText = async (
    prompt: string,
    model: string,
    systemInstruction?: string,
    thinkingBudget?: number,
    enableSearch?: boolean,
): Promise<GenerateTextResult> => {
    const config: any = {};
    if (systemInstruction) {
        config.systemInstruction = systemInstruction;
    }

    if (thinkingBudget !== undefined && model.includes('gemini-2.5-pro')) {
        config.thinkingConfig = { thinkingBudget };
    }

    if (enableSearch) {
        // Only googleSearch tool is permitted. Do not use it with other tools or responseMimeType/responseSchema.
        if (config.responseMimeType || config.responseSchema) {
            throw new Error("Cannot use responseMimeType or responseSchema with googleSearch tool.");
        }
        config.tools = [{ googleSearch: {} }];
    }

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: config,
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        return {
            text: response.text,
            groundingChunks: groundingChunks
        };
    } catch (error: any) {
        console.error(`Error generating text with Gemini model ${model}:`, error);
        throw new Error(`Failed to generate text (Gemini ${model}): ${error.message}`);
    }
};

/**
 * Generates an image using Imagen.
 * @param prompt The text prompt for image generation.
 * @param aspectRatio The desired aspect ratio ('1:1', '3:4', '4:3', '9:16', '16:9').
 * @returns A promise that resolves to the base64 encoded image data.
 */
export const geminiGenerateImage = async (
    prompt: string,
    aspectRatio: string = '1:1',
): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: aspectRatio as '1:1' | '3:4' | '4:3' | '9:16' | '16:9',
            },
        });

        const base64ImageBytes: string | undefined = response.generatedImages[0]?.image.imageBytes;
        if (!base64ImageBytes) {
            throw new Error("No image bytes received from Gemini.");
        }
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error: any) {
        console.error("Error generating image with Gemini:", error);
        throw new Error(`Failed to generate image (Gemini): ${error.message}`);
    }
};

/**
 * Edits an image using Gemini's image editing capabilities.
 * @param imageDataUrl The original image as a data URL.
 * @param prompt The text prompt describing the desired edit.
 * @returns A promise that resolves to the base64 encoded edited image data.
 */
export const geminiEditImage = async (
    imageDataUrl: string,
    prompt: string,
): Promise<string> => {
    try {
        const base64Data = dataUrlToBase64(imageDataUrl);
        const mimeType = imageDataUrl.substring(imageDataUrl.indexOf(":") + 1, imageDataUrl.indexOf(";"));

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType,
                        },
                    },
                    {
                        text: prompt,
                    },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        const base64ImageBytes: string | undefined = imagePart?.inlineData?.data;
        if (!base64ImageBytes) {
            throw new Error("No edited image bytes received from Gemini.");
        }
        return `data:image/jpeg;base64,${base64ImageBytes}`; // Assuming JPEG output
    } catch (error: any) {
        console.error("Error editing image with Gemini:", error);
        throw new Error(`Failed to edit image (Gemini): ${error.message}`);
    }
};

/**
 * Analyzes an image using Gemini.
 * @param imageDataUrl The image to analyze as a data URL.
 * @returns A promise that resolves to the text analysis of the image.
 */
export const geminiAnalyzeImage = async (imageDataUrl: string): Promise<string> => {
    try {
        const base64Data = dataUrlToBase64(imageDataUrl);
        const mimeType = imageDataUrl.substring(imageDataUrl.indexOf(":") + 1, imageDataUrl.indexOf(";"));

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType,
                        },
                    },
                    {
                        text: 'Describe this image in detail. Be thorough and helpful.',
                    },
                ],
            },
        });
        return response.text;
    } catch (error: any) {
        console.error("Error analyzing image with Gemini:", error);
        throw new Error(`Failed to analyze image (Gemini): ${error.message}`);
    }
};

/**
 * Generates a color palette from an image or a text description using Gemini.
 * Expects Gemini to return a JSON string in the format { "palette": [{ "hex": "#RRGGBB", "name": "Color Name" }, ...] }.
 * @param source An object containing either an `image` data URL or a `text` prompt.
 * @returns A promise that resolves to an array of Color objects.
 */
export const geminiGenerateColorPalette = async (
    source: { image?: string; text?: string }
): Promise<Color[]> => {
    if (!source.image && !source.text) {
        throw new Error("Either an image or a text prompt must be provided.");
    }

    try {
        let contents: any[] = [];
        let promptText = "";

        if (source.image) {
            const base64Data = dataUrlToBase64(source.image);
            const mimeType = source.image.substring(source.image.indexOf(":") + 1, source.image.indexOf(";"));
            contents.push({
                inlineData: { data: base64Data, mimeType: mimeType },
            });
            promptText = "Extract a 5-color palette from this image. Provide descriptive names and hex codes for each color. Respond in JSON format with a 'palette' array, each object having 'hex' and 'name' properties.";
        } else if (source.text) {
            promptText = `Generate a 5-color palette based on the theme: "${source.text}". Provide creative, descriptive names and hex codes for each color. Respond in JSON format with a 'palette' array, each object having 'hex' and 'name' properties.`;
        }
        contents.push({ text: promptText });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Using flash for fast JSON output
            contents: { parts: contents },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        palette: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    hex: { type: Type.STRING, description: 'Hex code of the color.' },
                                    name: { type: Type.STRING, description: 'Name of the color.' },
                                },
                                propertyOrdering: ["hex", "name"],
                            },
                        },
                    },
                    required: ["palette"],
                },
            },
        });

        let jsonStr = response.text.trim();
        const jsonResponse = JSON.parse(jsonStr);

        if (jsonResponse.palette && Array.isArray(jsonResponse.palette)) {
            return jsonResponse.palette.map((c: any) => ({
                hex: c.hex,
                name: c.name,
            }));
        } else {
            throw new Error("Gemini did not return a valid color palette in the expected JSON format.");
        }

    } catch (error: any) {
        console.error("Error generating color palette with Gemini:", error);
        if (error.message.includes("Unexpected token") || error.message.includes("JSON")) {
            throw new Error(`Failed to parse Gemini's response as JSON for palette generation. Raw error: ${error.message}`);
        }
        throw new Error(`Failed to generate palette (Gemini): ${error.message}`);
    }
};

export interface ChatMessagePart {
    text: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface ChatMessage {
    role: 'user' | 'model' | 'tool';
    parts: ChatMessagePart[];
}

/**
 * Streams chat responses from a Gemini model.
 * @param model The Gemini model name.
 * @param prompt The current user prompt.
 * @param history The previous chat history.
 * @param systemInstruction Optional system instruction.
 * @param enableSearch Optional flag to enable Google Search grounding.
 * @param thinkingBudget Optional thinking budget for Pro models.
 * @returns An async iterable of generated text chunks and grounding chunks.
 */
export async function* geminiStreamChat(
    model: string,
    prompt: string,
    history: ChatMessage[],
    systemInstruction?: string,
    enableSearch?: boolean,
    thinkingBudget?: number,
): AsyncGenerator<{ text: string; groundingChunks?: any[]; functionCalls?: any[] }> {
    const chat = ai.chats.create({
        model: model,
        config: {
            systemInstruction: systemInstruction,
            tools: enableSearch ? [{ googleSearch: {} }] : undefined,
            thinkingConfig: thinkingBudget !== undefined ? { thinkingBudget } : undefined,
        },
        history: history,
    });

    try {
        const response = await chat.sendMessageStream({ message: prompt });
        for await (const chunk of response) {
            yield {
                text: chunk.text,
                groundingChunks: chunk.candidates?.[0]?.groundingMetadata?.groundingChunks,
                // Fix: Access `functionCalls` directly from the `GenerateContentResponse` object (chunk).
                functionCalls: chunk.functionCalls,
            };
        }
    } catch (error: any) {
        console.error(`Error streaming chat with Gemini model ${model}:`, error);
        throw new Error(`Failed to stream chat (Gemini ${model}): ${error.message}`);
    }
}