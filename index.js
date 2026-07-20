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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ reply: 'Message payload is missing.' });
        }

        let marketContext = "";
        const lowerMsg = message.toLowerCase();
        
        // Smart ticker resolution for popular Indian and global equities
        let targetTicker = null;
        if (lowerMsg.includes('infosys') || lowerMsg.includes('infy')) targetTicker = 'INFY.NS';
        else if (lowerMsg.includes('tcs')) targetTicker = 'TCS.NS';
        else if (lowerMsg.includes('reliance')) targetTicker = 'RELIANCE.NS';
        else if (lowerMsg.includes('tata motors') || lowerMsg.includes('tatamotors')) targetTicker = 'TATAMOTORS.NS';
        else if (lowerMsg.includes('hdfc')) targetTicker = 'HDFCBANK.NS';
        else if (lowerMsg.includes('icici')) targetTicker = 'ICICIBANK.NS';

        // Fetch live quotes directly to avoid multi-turn signature overhead
        if (targetTicker) {
            try {
                const quoteData = await yahooFinance.quote(targetTicker, {}, { validateResult: false });
                marketContext = `\n\n[Live Market Feed Data for ${targetTicker}]: ${JSON.stringify(quoteData)}`;
            } catch (err) {
                console.error("Yahoo Finance Fetch Warning:", err.message);
                marketContext = `\n\n[Live Market Feed Data]: Could not fetch live stream for query, use baseline metrics.`;
            }
        }

        // Generate comprehensive research report via single robust turn
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: message + marketContext,
            config: {
                systemInstruction: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                - Provide technical market metrics, valuation snapshots (LTP, 52-week range, market cap, P/E, EPS, Dividend Yield), structural chart insights, and industry peer comparison markdown tables.
                - ABSOLUTELY REFUSE all unauthorized investment advice, buy/sell recommendations, or future price target predictions.
                - Format everything professionally using markdown headers and tables.`,
                temperature: 0.1
            }
        });

        res.json({ reply: response.text || "Compliance engine processed the request." });

    } catch (error) {
        console.error("Backend Error in /api/chat:", error);
        res.status(500).json({ reply: `Server encountered an execution exception: ${error.message || 'Pipeline failure.'}` });
    }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
}
