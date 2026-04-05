(() => {
  const frame = document.getElementById('panel-frame');
  if (!(frame instanceof HTMLIFrameElement)) return;
  frame.src = 'https://canvas.nishantmakwana.tech/?embedded=chrome-extension';
})();
