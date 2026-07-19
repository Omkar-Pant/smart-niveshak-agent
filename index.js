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
// Serves your index.html automatically
app.use(express.static('public'));

const PORT = process.env.PORT || 8080;

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Root route to serve your dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        const interaction = await ai.interactions.create({
            model: 'gemini-2.5-flash',
            input: message,
            config: {
                systemInstruction: "You are a factual financial assistant. Provide only technical metrics. Refuse all buy/sell recommendations.",
                tools: [], // Add your tool definition here
                temperature: 0.1
            }
        });

        res.json({ reply: interaction.text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Pipeline failure.' });
    }
});

// Vercel deployment export
export default app;

// Local development listener
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Pipeline live on port ${PORT}`));
}
