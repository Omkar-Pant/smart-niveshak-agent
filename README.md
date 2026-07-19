# Smart Niveshak AI Compliance Engine

An intelligent, full-stack financial research discovery agent tailored for Indian retail investors. This application operates under strict **SEBI compliance guardrails**, ensuring that users receive factual, technical market metrics without cross-contaminating discussions with unauthorized investment advice, opinions, or target prices.

## 🚀 Key Features
*   **SEBI Compliance Guardrails:** The engine systematically catches speculative questions ("Should I buy?", "Is this a good investment?") and safely redirects the output to objective parameters.
*   **Factual Data Extraction:** Leverages Gemini's function calling architecture to isolate and display key market data.
*   **Seamless Web Architecture:** Built as a standalone Node.js service designed to easily embed into custom web domains via native `<iframe>` integration.

## 🛠️ Technology Stack
*   **Frontend:** HTML5, CSS3 (Premium Dark-Theme Interface), Vanilla JavaScript
*   **Backend:** Node.js, Express.js
*   **AI Engine:** Gemini 2.5 Flash (`@google/genai`)

## 📋 Pre-requisites & Local Setup
Before deploying to production, ensure you have [Node.js](https://nodejs.org/) installed.

1. Clone the repository:
   ```bash
   git clone [https://github.com/Omkar-Pant/smart-niveshak-agent.git](https://github.com/Omkar-Pant/smart-niveshak-agent.git)
   cd smart-niveshak-agent
