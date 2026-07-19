import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai'; // Ensure this is installed via 'npm install @google/genai'
import yahooFinance from 'yahoo-finance2';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Initialize the client once
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ... (Your getStockMetricsTool and executeTool remain structurally sound)

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        // Use the Interactions API correctly
        const interaction = await ai.interactions.create({
            model: 'gemini-2.5-flash',
            input: message,
            config: {
                systemInstruction: "You are a financial assistant.", 
                tools: [{ functionDeclarations: [getStockMetricsTool.functionDeclarations[0]] }],
                temperature: 0.1
            }
        });

        // ... (The rest of your function calling logic)
        res.json({ reply: interaction.text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Pipeline failure.' });
    }
});

app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
