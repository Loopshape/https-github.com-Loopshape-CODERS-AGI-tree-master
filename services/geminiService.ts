
import { GoogleGenAI, Modality } from "@google/genai";

// It's assumed that process.env.API_KEY is set in the execution environment.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real application, you might want to handle this more gracefully,
  // but for this context, throwing an error is sufficient.
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Helper to extract base64 data and mimeType from a data URL string.
 * @param dataUrl The data URL (e.g., "data:image/jpeg;base64,...").
 * @returns An object containing the mimeType and base64Data.
 */
const dataUrlToParts = (dataUrl: string): { mimeType: string; base64Data: string } => {
    const regex = /^data:(.+);base64,(.*)$/;
    const match = dataUrl.match(regex);
    if (!match) {
        throw new Error("Invalid data URL format");
    }
    return { mimeType: match[1], base64Data: match[2] };
};

/**
 * Sends an image and a text prompt to the Gemini API to get an edited image.
 * @param originalImageDataUrl The original image as a data URL.
 * @param prompt The text prompt describing the desired edit.
 * @returns A promise that resolves to the edited image as a data URL.
 */
export const editImage = async (
    originalImageDataUrl: string,
    prompt: string
): Promise<string> => {
    try {
        const { mimeType, base64Data } = dataUrlToParts(originalImageDataUrl);

        const response = await ai.models.generateContent({
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

        // Find the image part in the response
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const editedBase64 = part.inlineData.data;
                const editedMimeType = part.inlineData.mimeType;
                return `data:${editedMimeType};base64,${editedBase64}`;
            }
        }

        throw new Error("No image was returned in the Gemini API response.");

    } catch (error) {
        console.error("Error editing image with Gemini:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to edit image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while editing the image.");
    }
};


/**
 * Generates an image using the Gemini API.
 * @param prompt The text prompt describing the desired image.
 * @param aspectRatio The desired aspect ratio for the image.
 * @returns A promise that resolves to the generated image as a data URL.
 */
export const generateImage = async (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png', // Using PNG for better quality
                aspectRatio: aspectRatio,
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        }

        throw new Error("No image was returned from the image generation API.");

    } catch (error) {
        console.error("Error generating image with Gemini:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the image.");
    }
};

/**
 * Analyzes an image using the Gemini API and returns a text description.
 * @param imageDataUrl The image to analyze as a data URL.
 * @returns A promise that resolves to the text analysis of the image.
 */
export const analyzeImage = async (imageDataUrl: string): Promise<string> => {
    try {
        const { mimeType, base64Data } = dataUrlToParts(imageDataUrl);
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType,
            },
        };
        const textPart = {
            text: "Describe this image in detail. Be thorough and helpful.",
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;

    } catch (error) {
        console.error("Error analyzing image with Gemini:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to analyze image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while analyzing the image.");
    }
};
