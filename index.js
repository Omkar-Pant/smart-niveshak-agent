import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai'; // Updated import
import yahooFinance from 'yahoo-finance2';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Initialize the new GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getStockMetricsTool = {
    type: 'function',
    name: 'getStockMetrics',
    description: 'Fetches live market metrics (Current Price, 50-DMA) for a given stock ticker.',
    parameters: {
        type: 'object',
        properties: {
            ticker: { type: 'string', description: 'The stock ticker symbol' }
        },
        required: ['ticker']
    }
};

async function executeTool(name, args) {
    if (name === 'getStockMetrics') {
        try {
            const ticker = args.ticker.toUpperCase();
            const quote = await yahooFinance.quote(ticker);
            return {
                ticker,
                current_price: quote.regularMarketPrice || "N/A",
                dma_50: quote.fiftyDayAverage || "N/A"
            };
        } catch (err) {
            return { error: 'Failed to extract market data.' };
        }
    }
    return { error: 'Unknown tool.' };
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        // 1. Initial request to Gemini
        const interaction = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "...", // Add your SYSTEM_INSTRUCTION here
                tools: [{ functionDeclarations: [getStockMetricsTool] }],
                temperature: 0.1
            }
        });

        // 2. Check for function calls in the interaction steps
        const fcStep = interaction.steps?.find(s => s.type === 'function_call');
        
        if (fcStep) {
            const toolResult = await executeTool(fcStep.name, fcStep.args);
            
            // 3. Send result back to model
            const finalResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { role: 'user', parts: [{ text: message }] },
                    { role: 'model', parts: [{ functionCall: { name: fcStep.name, args: fcStep.args } }] },
                    { role: 'tool', parts: [{ functionResponse: { name: fcStep.name, response: toolResult } }] }
                ]
            });
            return res.json({ reply: finalResponse.text });
        }

        res.json({ reply: interaction.text });
    } catch (error) {
        res.status(500).json({ error: 'Compliance pipeline execution failure.' });
    }
});

app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
