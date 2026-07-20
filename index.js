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
        
        // Multi-stock detection mapping array to handle single or multiple symbols simultaneously
        const trackedTickers = [
            { keywords: ['infosys', 'infy'], ticker: 'INFY.NS' },
            { keywords: ['tcs', 'tata consultancy'], ticker: 'TCS.NS' },
            { keywords: ['reliance'], ticker: 'RELIANCE.NS' },
            { keywords: ['tata motors', 'tatamotors'], ticker: 'TATAMOTORS.NS' },
            { keywords: ['hdfc'], ticker: 'HDFCBANK.NS' },
            { keywords: ['icici'], ticker: 'ICICIBANK.NS' }
        ];

        const matchedTickers = trackedTickers.filter(item => 
            item.keywords.some(kw => lowerMsg.includes(kw))
        );

        if (matchedTickers.length > 0) {
            marketContext += "\n\n[Live Market Feed Data fetched directly from NSE Exchange]:\n";
            for (const item of matchedTickers) {
                try {
                    const q = await yahooFinance.quote(item.ticker, {}, { validateResult: false });
                    // Explicitly format key financial metrics so the LLM doesn't fall back to baseline weights
                    marketContext += `- Ticker: ${item.ticker}\n` +
                                     `  Last Traded Price (LTP): ₹${q.regularMarketPrice ?? 'N/A'}\n` +
                                     `  52-Week Range: ₹${q.fiftyTwoWeekLow ?? 'N/A'} - ₹${q.fiftyTwoWeekHigh ?? 'N/A'}\n` +
                                     `  Market Cap: ₹${q.marketCap ? (q.marketCap / 1e7).toFixed(2) + ' Cr' : 'N/A'}\n` +
                                     `  P/E Ratio: ${q.trailingPE ?? 'N/A'}\n` +
                                     `  EPS (TTM): ₹${q.epsTrailingTwelveMonths ?? 'N/A'}\n` +
                                     `  Dividend Yield: ${q.dividendYield ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}\n`;
                } catch (err) {
                    console.error(`Yahoo Finance Fetch Warning for ${item.ticker}:`, err.message);
                    marketContext += `- Ticker ${item.ticker}: Live feed connection unavailable.\n`;
                }
            }
        }

        // Try generating content with gemini-3.5-flash, fallback to gemini-2.5-flash if rate-limited
        let response;
        try {
            response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: message + marketContext,
                config: {
                    systemInstruction: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                    - CRITICAL MANDATE: If '[Live Market Feed Data]' is provided in the prompt, you MUST use those exact live values for your valuation snapshot tables and metrics. Never override live data with outdated baseline or training memory figures.
                    - Provide technical market metrics, valuation snapshots (LTP, 52-week range, market cap, P/E, EPS, Dividend Yield), structural chart insights, and industry peer comparison markdown tables.
                    - ABSOLUTELY REFUSE all unauthorized investment advice, buy/sell recommendations, or future price target predictions.
                    - Format everything professionally using markdown headers and tables.`,
                    temperature: 0.1
                }
            });
        } catch (apiError) {
            // Fallback layer in case the free tier quota limit is hit on the primary model
            if (apiError.status === 'RESOURCE_EXHAUSTED' || (apiError.message && apiError.message.includes('429'))) {
                console.warn("Primary model rate limit hit. Falling back to alternative model route...");
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: message + marketContext,
                    config: {
                        systemInstruction: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                        - CRITICAL MANDATE: If '[Live Market Feed Data]' is provided in the prompt, you MUST use those exact live values for your valuation snapshot tables and metrics. Never override live data with outdated baseline or training memory figures.
                        - Provide technical market metrics, valuation snapshots (LTP, 52-week range, market cap, P/E, EPS, Dividend Yield), structural chart insights, and industry peer comparison markdown tables.
                        - ABSOLUTELY REFUSE all unauthorized investment advice, buy/sell recommendations, or future price target predictions.
                        - Format everything professionally using markdown headers and tables.`,
                        temperature: 0.1
                    }
                });
            } else {
                throw apiError;
            }
        }

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
