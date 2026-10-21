let keyboardTimer
window.recorderEffects.listen((value) => {
  if (value.type === 'click') {
    const node = document.createElement('div')
    node.className = value.emoji ? 'click emoji' : 'click'
    node.style.left = value.x + 'px'
    node.style.top = value.y + 'px'
    node.style.background = value.color
    if (value.emoji) node.textContent = value.emoji
    node.addEventListener('animationend', () => node.remove(), { once: true })
    document.body.appendChild(node)
  } else if (value.type === 'key') {
    const node = document.getElementById('keys')
    // 每个组合键独立显示为键帽，和设置中的样式预览保持一致。
    node.replaceChildren(
      ...String(value.keys)
        .split(' + ')
        .map((text) => {
          const key = document.createElement('kbd')
          key.textContent = text
          return key
        })
    )
    node.dataset.style = value.style
    const top = value.position?.includes('top'),
      middle = ['left', 'center', 'right'].includes(value.position)
    node.style.top = top ? '24px' : middle ? '50%' : 'auto'
    node.style.bottom = top || middle ? 'auto' : '24px'
    node.style.left = value.position?.startsWith('left')
      ? '24px'
      : value.position?.startsWith('right')
        ? 'auto'
        : '50%'
    node.style.right = value.position?.startsWith('right') ? '24px' : 'auto'
    node.style.transform =
      [node.style.left === '50%' ? 'translateX(-50%)' : '', middle ? 'translateY(-50%)' : '']
        .filter(Boolean)
        .join(' ') || 'none'
    node.style.opacity = '1'
    clearTimeout(keyboardTimer)
    keyboardTimer = setTimeout(() => {
      node.style.opacity = '0'
    }, 2000)
  }
})
