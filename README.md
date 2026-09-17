# PatungIn

> **Smart Receipt OCR & Proportional Split Bill Web Application**

PatungIn is a modern, mobile-first web application designed to simplify bill splitting from receipt photos. Powered by Google Gemini Vision AI, it automatically extracts line items, applies proportional tax and service charges (fair split), and generates formatted breakdown messages ready for messaging platforms like WhatsApp.

---

## Features

- **Automated Receipt Scanning**: Uses Google Gemini Vision API to extract merchant name, individual menu items, quantity, unit price, tax, and service charges.
- **Mobile-First Responsive Design**: Tailored specifically for smartphones (360px - 430px) with touch-friendly controls, bottom-sheet modals, and native-like app shell.
- **Smooth Entrance Splash Animation**: Polished branding intro with auto-dismiss and tap-to-skip.
- **Intuitive Receipt-First 4-Step Flow**:
  1. **Upload**: Select or drop a receipt photo, or test immediately with built-in presets (Kopi Kenangan, Bebek Kaleyo, Solaria).
  2. **Review Detail Pesanan**: Confirm line items, prices, PB1 restaurant tax, service charge, and discounts.
  3. **Pilih Teman & Bagi**: Dynamically select which friends participate in this bill, add new friends with quick inline input, choose the payer (who covered the bill), and assign items to diners.
  4. **Settlement & WhatsApp Export**: Review final per-person shares and copy or launch formatted payment breakdown messages directly to WhatsApp.
- **Proportional Fair Split**: Distributes restaurant tax (PB1) and service charges proportionally according to each member's consumption rather than equal flat splits.
- **Offline Simulation Mode**: Includes built-in sample receipts for development and testing without an active API key.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- An active [Google AI Studio API Key](https://aistudio.google.com/app/apikey) (optional, for real receipt OCR)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/dzakiabrar21/patungin.git
   cd patungin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (optional):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your `GEMINI_API_KEY`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```

4. Start the application:
   ```bash
   npm start
   ```
   For development with hot reload:
   ```bash
   npm run dev
   ```

5. Open your browser at `http://localhost:3000` (or `http://localhost:3001`).

---

## Project Structure

```
patungin/
├── public/
│   ├── index.html         # Application markup & mobile app shell
│   ├── css/
│   │   └── style.css      # Mobile-first fintech design system & animations
│   └── js/
│       └── app.js         # Client-side state, participant manager & calculation engine
├── services/
│   └── geminiService.js   # Multimodal Gemini OCR service & fallback presets
├── server.js              # Express API server
├── .gitignore             # Git ignored files
├── .env.example           # Example environment variables
└── package.json           # Project manifest
```

---

## License

This project is licensed under the [MIT License](LICENSE).
