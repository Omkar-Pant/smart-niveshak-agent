import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai'; 
import yahooFinance from 'yahoo-finance2';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 8080;

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define Tool for Yahoo Finance Market Data Extraction
const stockTool = {
    name: 'getStockData',
    description: 'Fetch real-time stock quotes, technical valuation metrics, and market data for a given ticker symbol.',
    parameters: {
        type: 'OBJECT',
        properties: {
            ticker: { 
                type: 'STRING', 
                description: 'The stock ticker symbol with exchange extension (e.g., TCS.NS, RELIANCE.NS, INFY.NS, AAPL)' 
            }
        },
        required: ['ticker']
    }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chat', async, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ reply: 'Message payload is missing.' });
        }

        // Step 1: Call Gemini using gemini-3.5-flash with registered tool definitions
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: message,
            config: {
                systemInstruction: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                - If the user mentions a specific stock or company, you MUST call the getStockData tool.
                - Provide technical market metrics, valuation snapshots, structural chart insights, and peer comparison tables.
                - ABSOLUTELY REFUSE all unauthorized investment advice, buy/sell recommendations, or future price target predictions.`,
                tools: [{ functionDeclarations: [stockTool] }],
                temperature: 0.1
            }
        });

        // Step 2: Handle tool calls safely using SDK function declarations structure
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === 'getStockData') {
                const args = call.args || {};
                let ticker = args.ticker || 'TCS.NS';
                
                let quoteData = {};
                try {
                    // Bypass strict schema validation to protect against dynamic Yahoo Finance updates
                    quoteData = await yahooFinance.quote(ticker, {}, { validateResult: false });
                } catch (err) {
                    console.error("Yahoo Finance Error:", err.message);
                    quoteData = { error: `Could not retrieve data for '${ticker}'. Please ensure proper exchange suffix is used (e.g., .NS for NSE).` };
                }

                // Step 3: Send the tool result back to Gemini using proper multi-turn role alignment
                const followUp = await ai.models.generateContent({
                    model: 'gemini-3.5-flash',
                    contents: [
                        { role: 'user', parts: [{ text: message }] },
                        { role: 'model', parts: [{ functionCall: call }] },
                        { 
                            role: 'function', 
                            parts: [{ 
                                functionResponse: { 
                                    name: 'getStockData', 
                                    response: { result: quoteData } 
                                } 
                            }] 
                        }
                    ],
                    config: {
                        systemInstruction: `You are a SEBI-compliant research engine. Format the provided quoteData into a structured research dossier containing:
                        1. Market & Valuation Snapshot Table (LTP, 52-week range, market cap, P/E, EPS, Dividend Yield).
                        2. Technical Analysis & Price Action Overview (Moving averages context, support/resistance observation, volume trend).
                        3. Industry Peer Comparison (Create a clean Markdown table comparing it against 2-3 standard sector peers with estimated industry metrics).
                        Include a strict compliance disclaimer header stating that no direct buy/sell recommendation is expressed.`
                    }
                });

                return res.json({ reply: followUp.text });
            }
        }

        // Fallback for general text responses or compliance queries (ensuring reply key matches frontend expectations)
        res.json({ reply: response.text || "Compliance engine processed the request." });

    } catch (error) {
        console.error("Backend Error in /api/chat:", error);
        // Always respond with JSON containing 'reply' to prevent frontend parser exceptions
        res.status(500).json({ reply: `Server encountered an execution exception: ${error.message || 'Pipeline failure.'}` });
    }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
}
