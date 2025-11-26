// public/script.js

const form = document.getElementById("quiz-form");
const statusDiv = document.getElementById("status");
const quizContainer = document.getElementById("quiz-container");
const quizTitle = document.getElementById("quiz-title");
const questionsDiv = document.getElementById("questions");
const submitAnswersBtn = document.getElementById("submit-answers-btn");
const resultsDiv = document.getElementById("results");
const generateBtn = document.getElementById("generate-btn");
const costInfoDiv = document.getElementById("cost-info");
const loadingOverlay = document.getElementById("loading-overlay");
const selectionHelper = document.getElementById("selection-helper");
const selectionExplainBtn = document.getElementById("selection-explain-btn");
const explainChat = document.getElementById("explain-chat");
const explainChatClose = document.getElementById("explain-chat-close");
const explainChatMessages = document.getElementById("explain-chat-messages");

let lastSelectionText = "";

let isDraggingChat = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let chatInitialized = false;

let currentQuestions = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loadingOverlay.classList.remove("hidden");

  const topicInput = document.getElementById("topic");
  const countInput = document.getElementById("count");
  const difficultySelect = document.getElementById("difficulty");

  const topic =
    topicInput.value.trim() || "AZ-900 (Microsoft Azure Fundamentals)";
  const count = parseInt(countInput.value) || 5;
  const difficulty = difficultySelect.value || "beginner";

  statusDiv.textContent = "Generating quiz...";
  costInfoDiv.textContent = "";
  resultsDiv.textContent = "";
  questionsDiv.innerHTML = "";
  quizContainer.classList.add("hidden");
  submitAnswersBtn.classList.add("hidden");
  generateBtn.disabled = true;

  try {
    const res = await fetch("/api/generate-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic, count, difficulty }), // ✅ include difficulty
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate quiz");
    }

    const data = await res.json();
    currentQuestions = data.questions || [];

    if (!currentQuestions.length) {
      statusDiv.textContent = "No questions returned from AI.";
      generateBtn.disabled = false;
      return;
    }

    statusDiv.textContent = "";
    quizTitle.textContent = `Topic: ${data.topic} (Difficulty: ${data.difficulty})`;
    renderQuestions(currentQuestions);
    quizContainer.classList.remove("hidden");
    submitAnswersBtn.classList.remove("hidden");

    // 💸 Show estimated cost if usage info is present
    if (data.usage) {
      const { promptTokens, completionTokens, estimatedCostUsd } = data.usage;
      costInfoDiv.textContent =
        `Estimated API cost for this quiz: $${estimatedCostUsd} ` +
        `(input: ${promptTokens} tokens, output: ${completionTokens} tokens, model: gpt-5-mini)`;
    } else {
      costInfoDiv.textContent = "";
    }
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Error: " + err.message;
  } finally {
    generateBtn.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
});

function renderQuestions(questions) {
  questionsDiv.innerHTML = "";

  questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "question-card";
    card.dataset.qid = q.id;

    const qText = document.createElement("div");
    qText.className = "question-text";
    qText.textContent = `${idx + 1}. ${q.question}`;
    card.appendChild(qText);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "options";

    q.options.forEach((opt, optIndex) => {
      const letter = ["A", "B", "C", "D"][optIndex] || "A";

      const label = document.createElement("label");
      label.className = "option-label";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.value = letter;

      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + opt));

      optionsDiv.appendChild(label);
    });

    card.appendChild(optionsDiv);
    questionsDiv.appendChild(card);
  });
}

submitAnswersBtn.addEventListener("click", () => {
  if (!currentQuestions.length) return;

  let correctCount = 0;
  let total = currentQuestions.length;

  // Reset classes + old explanations
  document.querySelectorAll(".question-card").forEach((el) => {
    el.classList.remove("correct", "incorrect");
    const oldExp = el.querySelector(".question-explanation");
    if (oldExp) oldExp.remove();
  });

  const letters = ["A", "B", "C", "D"];

  currentQuestions.forEach((q) => {
    const card = document.querySelector(`.question-card[data-qid="${q.id}"]`);
    if (!card) return;

    const selected = document.querySelector(`input[name="${q.id}"]:checked`);
    const userAnswer = selected ? selected.value : null;

    const isCorrect = userAnswer === q.correctOption;
    if (isCorrect) {
      correctCount++;
      card.classList.add("correct");
    } else {
      card.classList.add("incorrect");
    }

    // Work out correct option text
    const correctIndex = letters.indexOf(q.correctOption);
    const correctText =
      correctIndex >= 0 && q.options[correctIndex]
        ? q.options[correctIndex]
        : `Option ${q.correctOption}`;

    // Build explanation block
    const exp = document.createElement("div");
    exp.className = "question-explanation";

    let baseLine = `Correct answer: ${q.correctOption}`;

    if (q.explanation && q.explanation.trim().length > 0) {
      exp.textContent = `${baseLine}. ${q.explanation}`;
    } else {
      exp.textContent = baseLine;
    }

    card.appendChild(exp);
  });

  const percent = Math.round((correctCount / total) * 100);
  resultsDiv.textContent = `You scored ${correctCount} / ${total} (${percent}%)`;
});

document.addEventListener("mouseup", (e) => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";

  // Hide if no meaningful selection or very long
  if (!text || text.length < 2 || text.length > 200) {
    selectionHelper.classList.add("hidden");
    lastSelectionText = "";
    return;
  }

  lastSelectionText = text;

  // Position helper near mouse cursor
  const x = e.pageX;
  const y = e.pageY;
  selectionHelper.style.left = `${x}px`;
  selectionHelper.style.top = `${y}px`;
  selectionHelper.classList.remove("hidden");
});

// Hide helper if user clicks anywhere empty (optional)
document.addEventListener("click", (e) => {
  // if click is outside the helper itself
  if (!selectionHelper.contains(e.target)) {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (!text) {
      selectionHelper.classList.add("hidden");
    }
  }
});

selectionExplainBtn.addEventListener("click", async () => {
  selectionHelper.classList.add("hidden");
  ensureChatPosition();

  // Dragging for explain chat
  const explainChatHeader = document.querySelector(".explain-chat-header");

  if (explainChatHeader) {
    explainChatHeader.addEventListener("mousedown", (e) => {
      // don't start drag when clicking the close button
      if (e.target === explainChatClose) return;

      isDraggingChat = true;
      const rect = explainChat.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });
  }

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingChat) return;

    let newLeft = e.clientX - dragOffsetX;
    let newTop = e.clientY - dragOffsetY;

    const rect = explainChat.getBoundingClientRect();
    const padding = 8;

    const maxLeft = window.innerWidth - rect.width - padding;
    const maxTop = window.innerHeight - rect.height - padding;

    if (newLeft < padding) newLeft = padding;
    if (newTop < padding) newTop = padding;
    if (newLeft > maxLeft) newLeft = maxLeft;
    if (newTop > maxTop) newTop = maxTop;

    explainChat.style.left = `${newLeft}px`;
    explainChat.style.top = `${newTop}px`;
  });

  document.addEventListener("mouseup", () => {
    isDraggingChat = false;
  });

  const text = lastSelectionText.trim();
  if (!text) return;

  // Topic + difficulty from form
  const topicInput = document.getElementById("topic");
  const difficultySelect = document.getElementById("difficulty");

  const topic =
    (topicInput && topicInput.value.trim()) ||
    "AZ-900 (Microsoft Azure Fundamentals)";
  const difficulty =
    difficultySelect && difficultySelect.value
      ? difficultySelect.value
      : "beginner";

  // Open chat if closed
  explainChat.classList.remove("hidden");

  // Add user message
  const userMsg = document.createElement("div");
  userMsg.className = "explain-msg explain-msg-user";
  userMsg.innerHTML =
    '<div class="explain-msg-label">You selected</div>' + `<div>${text}</div>`;
  explainChatMessages.appendChild(userMsg);

  // Add loading message
  const loadingMsg = document.createElement("div");
  loadingMsg.className = "explain-msg explain-msg-loading";
  loadingMsg.textContent = "Thinking...";
  explainChatMessages.appendChild(loadingMsg);
  explainChatMessages.scrollTop = explainChatMessages.scrollHeight;

  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, text, difficulty }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to get explanation");
    }

    const data = await res.json();

    // Replace loading with AI message
    loadingMsg.remove();

    const aiMsg = document.createElement("div");
    aiMsg.className = "explain-msg explain-msg-ai";
    aiMsg.innerHTML =
      '<div class="explain-msg-label">Explanation</div>' +
      `<div class="explain-html">${marked.parse(data.explanation || "")}</div>`;
    explainChatMessages.appendChild(aiMsg);
    explainChatMessages.scrollTop = explainChatMessages.scrollHeight;
  } catch (err) {
    console.error(err);
    loadingMsg.textContent = "Error: " + err.message;
  }
});

explainChatClose.addEventListener("click", () => {
  explainChat.classList.add("hidden");
});

function ensureChatPosition() {
  if (chatInitialized) return;

  // Set a nice starting width/height
  explainChat.style.width = "340px";
  explainChat.style.height = "auto";

  // Place center-right
  const padding = 25;
  const left = window.innerWidth - 340 - padding;
  const top = window.innerHeight / 2 - 150; // mid screen

  explainChat.style.left = `${left}px`;
  explainChat.style.top = `${top}px`;

  chatInitialized = true;
}
