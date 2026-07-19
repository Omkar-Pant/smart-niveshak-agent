app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const interaction = await ai.interactions.create({
            model: 'gemini-2.5-flash',
            input: message,
            config: {
                systemInstruction: "You are a financial assistant.",
                temperature: 0.1
            }
        });
        res.json({ reply: interaction.text });
    } catch (error) {
        console.error("DEBUG ERROR:", error);
        res.status(500).json({ error: error.message || "Unknown error" });
    }
});
