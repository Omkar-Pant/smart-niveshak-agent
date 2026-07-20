import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from 'axios';
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

// In-memory cache layer (5-minute TTL) to preserve API limits
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
        
        // Comprehensive ticker configuration dictionary supporting US and Indian markets
        const trackedTickers = [
            { keywords: ['infosys', 'infy'], ticker: 'INFY.NS' },
            { keywords: ['tcs', 'tata consultancy'], ticker: 'TCS.NS' },
            { keywords: ['reliance'], ticker: 'RELIANCE.NS' },
            { keywords: ['tata motors', 'tatamotors'], ticker: 'TATAMOTORS.NS' },
            { keywords: ['hdfc'], ticker: 'HDFCBANK.NS' },
            { keywords: ['icici'], ticker: 'ICICIBANK.NS' },
            { keywords: ['apple', 'aapl'], ticker: 'AAPL' },
            { keywords: ['tesla', 'tsla'], ticker: 'TSLA' }
        ];

        const matchedTickers = trackedTickers.filter(item => 
            item.keywords.some(kw => lowerMsg.includes(kw))
        );

        if (matchedTickers.length > 0) {
            marketContext += "\n\n[MANDATORY LIVE EXCHANGE DATA FEED]:\n";
            const now = Date.now();

            for (const item of matchedTickers) {
                let quoteData = null;
                const cachedEntry = marketCache.get(item.ticker);

                // Check cache first to stay within API rate limits
                if (cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL_MS)) {
                    quoteData = cachedEntry.data;
                } else {
                    try {
                        // Using Twelve Data REST endpoint (Replace TWELVE_DATA_API_KEY in your .env file)
                        // Get a free key at https://twelvedata.com
                        const response = await axios.get(`https://api.twelvedata.com/quote`, {
                            params: {
                                symbol: item.ticker,
                                apikey: process.env.TWELVE_DATA_API_KEY
                            },
                            timeout: 5000
                        });

                        const data = response.data;

                        if (!data || data.status === "error" || !data.close) {
                            throw new Error(data.message || `API payload failure for ${item.ticker}`);
                        }

                        quoteData = {
                            price: data.close,
                            high: data.high || 'N/A',
                            low: data.low || 'N/A',
                            volume: data.volume || 'N/A',
                            currency: data.currency || 'INR',
                            exchange: data.exchange || 'NSE',
                            fiftyTwoWeekHigh: data.fifty_two_week?.high || 'N/A',
                            fiftyTwoWeekLow: data.fifty_two_week?.low || 'N/A'
                        };

                        // Store in cache
                        marketCache.set(item.ticker, { timestamp: now, data: quoteData });

                    } catch (apiError) {
                        console.error(`Live Fetch Error for ${item.ticker}:`, apiError.message);
                        
                        // Fail gracefully if cache exists, otherwise abort to prevent fake data
                        if (cachedEntry) {
                            quoteData = cachedEntry.data;
                        } else {
                            return res.status(502).json({ 
                                reply: `⚠️ **Live Feed Connection Error:** Unable to fetch real-time market data for ${item.ticker} from the live exchange provider.` 
                            });
                        }
                    }
                }

                marketContext += `- Asset Ticker: ${item.ticker} (${quoteData.exchange})\n` +
                                 `  Last Traded Price (LTP): ${quoteData.currency === 'INR' ? '₹' : '$'}${quoteData.price}\n` +
                                 `  Day High / Low: ${quoteData.high} / ${quoteData.low}\n` +
                                 `  52-Week Range: ${quoteData.fiftyTwoWeekLow} - ${quoteData.fiftyTwoWeekHigh}\n` +
                                 `  Volume: ${quoteData.volume}\n`;
            }
        }

        // Generate response via Groq
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are the Smart Niveshak SEBI-Compliant Financial Research Agent. 
                    - CRITICAL MANDATE: If '[MANDATORY LIVE EXCHANGE DATA FEED]' is present, you must build your tables and statements strictly using those live numbers. 
                    - Never mention 2023 data, training limits, or lack of connectivity. 
                    - Keep formatting strictly professional using markdown tables.`
                },
                {
                    role: 'user',
                    content: message + marketContext
                }
            ],
            temperature: 0.0
        });

        const replyText = completion.choices[0]?.message?.content || "Compliance engine processed the request.";
        res.json({ reply: replyText });

    } catch (error) {
        console.error("Backend Error in /api/chat:", error);
        res.status(500).json({ reply: `Server encountered an exception: ${error.message || 'Pipeline failure.'}` });
    }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Live Universal Financial Pipeline running on port ${PORT}`));
}
