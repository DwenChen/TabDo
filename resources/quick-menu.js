window.quickMenu.onItems((items) => {
  const container = document.querySelector('#sites')
  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = item.name
    button.setAttribute('role', 'menuitem')
    button.addEventListener('click', () => window.quickMenu.select(item.id))
    container.append(button)
  }
  container.firstElementChild?.focus()
})
document.querySelector('#cancel').addEventListener('click', () => window.quickMenu.select(''))
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.quickMenu.select('')
  else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    const buttons = [...document.querySelectorAll('#sites button')],
      index = buttons.indexOf(document.activeElement)
    buttons[
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    ]?.focus()
  }
})
