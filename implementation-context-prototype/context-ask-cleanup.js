(() => {
  const prior = window.STATE_ASK;
  if (!prior) return;

  function render(payload, liveStatus) {
    const html = prior.render(payload, liveStatus);
    if (typeof html !== 'string') return html;
    return html.replace(/<aside class="ask-state-actions">[\s\S]*?<\/aside>/g, '');
  }

  window.STATE_ASK = Object.freeze({
    ...prior,
    render,
  });
})();
