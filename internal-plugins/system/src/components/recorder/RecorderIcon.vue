<script setup>
defineProps({ name: { type: String, required: true } })
const paths = {
  screen: 'M3 4h18v13H3zM9 21h6m-3-4v4',
  window: 'M4 5h16v15H4zM4 9h16M7 7h.01M10 7h.01',
  region: 'M5 2v17h17M2 5h17v17',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l.5 3 2 1.2L20 6l3 5-2.5 2 .1 2.2 2.4 2-3 5-2.7-1.2L15 22H9l-.5-3-2-1.2L4 19l-3-5 2.5-2-.1-2.2L1 8l3-5 2.7 1.2L9 3Z',
  speaker: 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14',
  microphone: 'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0zM6 10v2a6 6 0 0 0 12 0v-2M12 18v4m-3 0h6',
  cursor: 'm5 3 14 11-7 1-4 6z',
  click: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5m-5-2 10 3-5 2-2 5z',
  keyboard: 'M2 5h20v14H2zM5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M6 16h12',
  record: 'M3 5h12v14H3zM15 10l6-4v12l-6-4z',
  play: 'm8 5 11 7-11 7z',
  stop: 'M6 6h12v12H6z',
  reset: 'M4 11a8 8 0 1 1 2 7M4 4v7h7',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6'
}
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path :d="paths[name] || paths.record" />
  </svg>
</template>
