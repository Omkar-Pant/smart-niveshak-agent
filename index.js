import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
import yahooFinance from 'yahoo-finance2';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Initialize the new GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the tool
const getStockMetricsTool = {
    functionDeclarations: [{
        name: 'getStockMetrics',
        description: 'Fetches live market metrics (Current Price, 50-DMA) for a given stock ticker.',
        parameters: {
            type: 'object',
            properties: {
                ticker: { type: 'string', description: 'The stock ticker symbol' }
            },
            required: ['ticker']
        }
    }]
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

        // Use the Interactions API
        const interaction = await ai.interactions.create({
            model: 'gemini-2.5-flash',
            input: message,
            config: {
                systemInstruction: "You are a financial assistant.", 
                tools: [getStockMetricsTool],
                temperature: 0.1
            }
        });

        // Check if the model requested a function call
        const fcStep = interaction.steps?.find(s => s.type === 'function_call');
        
        if (fcStep) {
            const toolResult = await executeTool(fcStep.name, fcStep.args);
            
            // Send result back using the continuation API
            const finalResponse = await interaction.continue({
                parts: [{
                    functionResponse: { name: fcStep.name, response: toolResult }
                }]
            });
            
            return res.json({ reply: finalResponse.text });
        }

        res.json({ reply: interaction.text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Compliance pipeline execution failure.' });
    }
});

app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
