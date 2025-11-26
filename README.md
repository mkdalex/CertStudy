# AI Exam Quiz Generator
An interactive study tool that generates realistic certification-style exam questions using the OpenAI API (gpt-5-mini).  
Built with Node.js, Express, and vanilla HTML/CSS/JS — no frontend frameworks.

This project allows you to quickly practice for exams like AZ-900, AWS Cloud Practitioner, CompTIA, or any other topic.  
It also includes a floating AI-powered Study Helper that explains any highlighted term directly inside the page.

---

## Features

### AI-Generated Practice Quizzes
- Choose any exam/topic (e.g., AZ-900, Networking, Security)
- Choose number of questions
- Difficulty options: Beginner, Intermediate, Expert
- Generates unique, non-repeated multiple-choice questions
- Auto-grades answers with visual highlighting

### Floating AI Study Helper
Highlight any word or phrase → "Explain this" bubble appears.  
Opens a draggable, resizable floating window containing:
- **Summary** (1 sentence)
- **In simple terms** (2–3 sentences)
- **Why it matters for the exam** (bullet points)
- Clean Markdown rendered using marked.js

### Cost Breakdown
Each quiz shows:
- Prompt tokens
- Completion tokens
- Estimated API cost

---

## Tech Stack

Backend:
- Node.js  
- Express  
- OpenAI API (chat completions)

Frontend:
- HTML  
- Vanilla JavaScript  
- Custom CSS  
- marked.js (Markdown → HTML)

---

## Project Structure

certStudy/  
│  
├── server.js              (Express server + OpenAI integration)  
├── package.json  
├── .gitignore  
├── README.md  
│  
├── public/  
│   ├── index.html  
│   ├── styles.css  
│   ├── script.js  
│  
└── .env                     (contains OpenAI API key, ignored by Git)

---

## Installation & Setup

### 1. Install dependencies
```
npm install
```

### 2. Create a .env file in the project root
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### 3. Start the server
```
npm start
```

Then visit:  
http://localhost:3000

---

## Environment Variables

**OPENAI_API_KEY**  
Your OpenAI key for generating questions and explanations.

**PORT**  
Server port (default 3000)

---

## How It Works

1. User enters topic + difficulty + question count  
2. Frontend calls `/api/generate-quiz`  
3. Server sends structured prompt to OpenAI  
4. OpenAI responds with JSON questions  
5. Frontend renders quiz and grades answers  
6. Highlighted text → `/api/explain`  
7. AI explanation returned and displayed in floating window  
8. Markdown converted to styled HTML

---

## License

MIT License — free to use, modify, and distribute.
