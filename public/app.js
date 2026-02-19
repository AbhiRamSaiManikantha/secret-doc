(function () {
  const claimedEl = document.getElementById('claimed-message');
  const verifyPanel = document.getElementById('verify-panel');
  const verifyForm = document.getElementById('verify-form');
  const questionsContainer = document.getElementById('questions-container');
  const verifyError = document.getElementById('verify-error');
  const successPanel = document.getElementById('success-panel');
  const downloadHint = document.getElementById('download-hint');

  function showError(msg) {
    verifyError.textContent = msg || '';
    verifyError.hidden = !msg;
  }

  function setState(claimed, passed, questions, q3Description) {
    if (claimed) {
      claimedEl.hidden = false;
      verifyPanel.hidden = true;
      successPanel.hidden = true;
      return;
    }
    claimedEl.hidden = true;
    if (passed) {
      verifyPanel.hidden = true;
      successPanel.hidden = false;
      return;
    }
    successPanel.hidden = true;
    verifyPanel.hidden = false;
    renderQuestions(questions || [], q3Description || '');
  }

  function renderQuestions(questions, q3Description) {
    questionsContainer.innerHTML = '';
    if (questions.length >= 1) {
      const g1 = document.createElement('div');
      g1.className = 'question-group';
      g1.innerHTML =
        '<label for="q1" class="question-label">' + escapeHtml(questions[0]) + '</label>' +
        '<input type="text" id="q1" name="answer" autocomplete="off" placeholder="Your answer">';
      questionsContainer.appendChild(g1);
    }
    if (questions.length >= 2) {
      const g2 = document.createElement('div');
      g2.className = 'question-group';
      g2.innerHTML =
        '<label for="q2" class="question-label">' + escapeHtml(questions[1]) + '</label>' +
        '<input type="text" id="q2" name="answer" autocomplete="off" placeholder="Your answer">';
      questionsContainer.appendChild(g2);
    }
    if (questions.length >= 3) {
      const g3 = document.createElement('div');
      g3.className = 'question-group question-group-q3';
      g3.innerHTML =
        '<label class="question-label">' + escapeHtml(questions[2]) + '</label>' +
        (q3Description ? '<p class="q3-description">' + escapeHtml(q3Description) + '</p>' : '') +
        '<div class="q3-buttons">' +
        '<button type="button" class="q3-btn" data-answer="YES">YES</button>' +
        '<button type="button" class="q3-btn" data-answer="NO">NO</button>' +
        '</div>';
      questionsContainer.appendChild(g3);
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function fetchStatus() {
    return fetch('/api/status').then(function (r) {
      return r.json();
    });
  }

  function submitAnswers(answers) {
    showError('');
    verifyForm.querySelectorAll('input[name="answer"]').forEach(function (input) {
      input.disabled = true;
    });
    document.querySelectorAll('.q3-btn').forEach(function (btn) {
      btn.disabled = true;
    });

    fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: answers })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (r.ok && data.success) {
            setState(false, true);
            return;
          }
          if (r.status === 403 && data.error === 'already_claimed') {
            setState(true);
            return;
          }
          setState(false, false, questionsContainer._lastQuestions, questionsContainer._lastQ3Desc);
          showError(data.message || 'Verification failed. Please try again.');
        });
      })
      .catch(function () {
        setState(false, false, questionsContainer._lastQuestions, questionsContainer._lastQ3Desc);
        showError('Network error. Please try again.');
      })
      .finally(function () {
        verifyForm.querySelectorAll('input[name="answer"]').forEach(function (input) {
          input.disabled = false;
        });
        document.querySelectorAll('.q3-btn').forEach(function (btn) {
          btn.disabled = false;
        });
      });
  }

  verifyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const inputs = verifyForm.querySelectorAll('input[name="answer"]');
    const answers = Array.from(inputs).map(function (input) {
      return input.value.trim();
    });
    if (answers.length >= 2) {
      answers.push('YES');
    }
    submitAnswers(answers);
  });

  questionsContainer.addEventListener('click', function (e) {
    const btn = e.target.closest('.q3-btn[data-answer]');
    if (!btn) return;
    const q1 = document.getElementById('q1');
    const q2 = document.getElementById('q2');
    const a1 = q1 ? q1.value.trim() : '';
    const a2 = q2 ? q2.value.trim() : '';
    const answers = [a1, a2, btn.getAttribute('data-answer')];
    submitAnswers(answers);
  });

  successPanel.querySelector('.format-buttons').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-format]');
    if (!btn) return;
    const format = btn.getAttribute('data-format');
    btn.disabled = true;
    downloadHint.hidden = false;

    fetch('/api/request-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: format })
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.token) {
          window.location.href = '/api/download?token=' + encodeURIComponent(data.token);
        } else {
          downloadHint.textContent = data.error || 'Failed to get download link.';
        }
      })
      .catch(function () {
        downloadHint.textContent = 'Failed to get download link.';
      });
  });

  fetchStatus()
    .then(function (data) {
      if (data.claimed) {
        setState(true);
        return;
      }
      if (data.passed) {
        setState(false, true);
        return;
      }
      questionsContainer._lastQuestions = data.questions;
      questionsContainer._lastQ3Desc = data.q3Description || '';
      setState(false, false, data.questions, data.q3Description);
    })
    .catch(function () {
      setState(false, false, []);
      showError('Could not load verification form.');
    });
})();
