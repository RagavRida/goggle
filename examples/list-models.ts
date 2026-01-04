
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('No API key found');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    console.log('Fetching models...');

    try {
        // We can't list models directly via the typed SDK easily in all versions, 
        // but let's try assuming the user has a recent version or we'll just try to make a generic call if possible.
        // Actually, the SDK doesn't expose listModels on the main class in some versions.
        // But let's try accessing it if it exists or use a fetch.

        // Alternative: use a raw fetch 
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.error('Failed to list models:', await response.text());
            return;
        }

        const data = await response.json();
        const models = (data as any).models;

        console.log('\nAvailable Models:');
        for (const model of models) {
            if (model.supportedGenerationMethods?.includes('generateContent')) {
                console.log(`- ${model.name} (${model.displayName})`);
            }
        }
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
