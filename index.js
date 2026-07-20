import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
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

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error("CRITICAL ERROR: GROQ_API_KEY environment variable is missing!");
}

const groq = new OpenAI({
    apiKey: apiKey || "missing_key",
    baseURL: 'https://api.groq.com/openai/v1',
});

// Simple In-Memory Cache Store with 5-Minute TTL to prevent rate limits
const marketCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; 

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
        
        // Tracked tickers mapping array
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
            const now = Date.now();

            for (const item of matchedTickers) {
                let q = null;
                const cachedEntry = marketCache.get(item.ticker);

                // Check if valid cache exists within TTL window
                if (cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL_MS)) {
                    q = cachedEntry.data;
                } else {
                    try {
                        // Strict live fetch with no fallback constants
                        q = await yahooFinance.quote(item.ticker, {}, { validateResult: false });
                        
                        if (!q || q.regularMarketPrice === undefined) {
                            throw new Error(`Live quote returned empty values for ${item.ticker}`);
                        }

                        // Store fresh response in cache
                        marketCache.set(item.ticker, { timestamp: now, data: q });
                    } catch (err) {
                        console.error(`Live Feed Error for ${item.ticker}:`, err.message);
                        
                        // Fallback to stale cache if available, otherwise abort safely
                        if (cachedEntry) {
                            console.warn(`Serving stale cached data for ${item.ticker} due to network timeout.`);
                            q = cachedEntry.data;
                        } else {
                            return res.status(502).json({ 
                                reply: `⚠️ **Live Feed Connection Error:** Unable to establish a real-time connection with the NSE exchange for ${item.ticker}. Operation aborted to prevent outdated reporting.` 
                            });
                        }
                    }
                }

                marketContext += `- Ticker: ${item.ticker}\n` +
                                 `  Last Traded Price (LTP): ₹${q.regularMarketPrice}\n` +
                                 `  52-Week Range: ₹${q.fiftyTwoWeekLow ?? 'N/A'} - ₹${q.fiftyTwoWeekHigh ?? 'N/A'}\n` +
                                 `  Market Cap: ₹${q.marketCap ? (q.marketCap / 1e7).toFixed(2) + ' Cr' : 'N/A'}\n` +
                                 `  P/E Ratio: ${q.trailingPE ?? 'N/A'}\n` +
                                 `  EPS (TTM): ₹${q.epsTrailingTwelveMonths ?? 'N/A'}\n` +
                                 `  Dividend Yield: ${q.dividendYield ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}\n`;
            }
        }

        // Generate content using Groq's Llama 3 model
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                    - CRITICAL MANDATE: If '[Live Market Feed Data]' is provided in the prompt, you MUST use those exact live values for your valuation snapshot tables and metrics. Never override live data with outdated baseline or training memory figures.
                    - Provide technical market metrics, valuation snapshots (LTP, 52-week range, market cap, P/E, EPS, Dividend Yield), structural chart insights, and industry peer comparison markdown tables.
                    - ABSOLUTELY REFUSE all unauthorized investment advice, buy/sell recommendations, or future price target predictions.
                    - Format everything professionally using markdown headers and tables.`
                },
                {
                    role: 'user',
                    content: message + marketContext
                }
            ],
            temperature: 0.1
        });

        const replyText = completion.choices[0]?.message?.content || "Compliance engine processed the request.";
        res.json({ reply: replyText });

    } catch (error) {
        console.error("Backend Error in /api/chat:", error);
        res.status(500).json({ reply: `Server encountered an execution exception: ${error.message || 'Pipeline failure.'}` });
    }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
}
