window.recorder.onState((state) => {
  if (state.phase !== 'countdown') return
  const value = parseInt(state.message, 10)
  if (!Number.isFinite(value)) return
  const node = document.createElement('div')
  node.id = 'number'
  node.textContent = String(value)
  document.getElementById('container').replaceChildren(node)
})
