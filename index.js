import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import yahooFinance from 'yahoo-finance2';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 8080;

// Initialize the Gemini client using the modern official SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Step 1: Define the live market extraction tool structure for the model
const getStockMetrics = {
    name: 'getStockMetrics',
    description: 'Fetches live market metrics (Current Price, 50-DMA) for a given stock ticker.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            ticker: { 
                type: Type.STRING, 
                description: 'The exact stock ticker symbol (e.g., RELIANCE.NS for India, or AAPL for US)' 
            }
        },
        required: ['ticker']
    }
};

// Step 2: Create the execution function that calls Yahoo Finance
async function executeTool(name, args) {
    if (name === 'getStockMetrics') {
        try {
            let ticker = args.ticker.toUpperCase();
            const quote = await yahooFinance.quote(ticker);
            return {
                ticker: ticker,
                current_price: quote.regularMarketPrice || "N/A",
                dma_50: quote.fiftyDayAverage || "N/A",
                status: "Live Market Data Successfully Extracted"
            };
        } catch (err) {
            return { error: 'Failed to extract live market data for ticker.' };
        }
    }
    return { error: 'Unknown compliance tool requested.' };
}

// Step 3: Enforce the foundational systemic guardrails
const SYSTEM_INSTRUCTION = `
You are the Smart Niveshak AI Compliance Engine. You provide factual market discoveries for retail investors.
CRITICAL COMPLIANCE REQUIREMENT: You are completely forbidden from giving subjective opinions, buy/sell targets, or market directional speculation.
If a user prompts you for an investment decision or target price, you must:
1. Neutrally state that SEBI regulations restrict you from providing financial recommendations.
2. Trigger your tool 'getStockMetrics' to surface raw data parameters.
3. Present the numbers neutrally. 
4. Always conclude with your standard regulatory disclaimer string.
`;

// Step 4: The orchestration route
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Initial call telling Gemini it has access to the stock metric tool
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: [getStockMetrics] }],
                temperature: 0.1
            }
        });

        const functionCalls = response.functionCalls;
        
        // If Gemini determines it needs to pull live data (RAG)
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            const toolResult = await executeTool(call.name, call.args);
            
            // Loop back the real database results to the LLM to write a clean reply
            const finalResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { role: 'user', parts: [{ text: message }] },
                    { role: 'model', parts: [{ functionCall: call }] },
                    { role: 'tool', parts: [{ functionResponse: { name: call.name, response: toolResult } }] }
                ],
                config: { systemInstruction: SYSTEM_INSTRUCTION }
            });
            
            return res.json({ reply: finalResponse.text });
        }

        // Return a standard text response if no tool call was needed
        res.json({ reply: response.text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Compliance pipeline execution failure.' });
    }
});

app.listen(PORT, () => console.log(`Smart Niveshak Compliance Pipeline live on port ${PORT}`));
