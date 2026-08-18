// Reusable "test your understanding" quiz. Renders into `container`, one question
// at a time revealed as a block; no framework, no build step, matches the rest of the site.
function initQuiz(container, questions) {
  container.innerHTML = "";
  let score = 0;
  const answered = new Array(questions.length).fill(false);

  const scoreEl = document.createElement("div");
  scoreEl.className = "quiz-score";
  container.appendChild(scoreEl);

  questions.forEach((item, qi) => {
    const qEl = document.createElement("div");
    qEl.className = "quiz-q";

    const qText = document.createElement("p");
    qText.className = "quiz-q__text";
    qText.textContent = `${qi + 1}. ${item.q}`;
    qEl.appendChild(qText);

    const optsEl = document.createElement("div");
    optsEl.className = "quiz-options";

    const explainEl = document.createElement("p");
    explainEl.className = "quiz-explain";
    explainEl.textContent = item.explain;
    explainEl.hidden = true;

    item.options.forEach((opt, oi) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        if (answered[qi]) return;
        answered[qi] = true;
        optsEl.querySelectorAll(".quiz-option").forEach((b, bi) => {
          b.disabled = true;
          if (bi === item.correct) b.classList.add("correct");
        });
        if (oi === item.correct) score++;
        else btn.classList.add("incorrect");
        explainEl.hidden = false;
        updateScore();
      });
      optsEl.appendChild(btn);
    });

    qEl.appendChild(optsEl);
    qEl.appendChild(explainEl);
    container.appendChild(qEl);
  });

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "viz-btn viz-btn--ghost quiz-retry";
  retryBtn.textContent = "Retry Quiz";
  retryBtn.addEventListener("click", () => initQuiz(container, questions));
  container.appendChild(retryBtn);

  updateScore();

  function updateScore() {
    const done = answered.filter(Boolean).length;
    scoreEl.textContent = done < questions.length
      ? `Score: ${score} / ${questions.length} (${questions.length - done} left)`
      : `Score: ${score} / ${questions.length} — done!`;
  }
}
