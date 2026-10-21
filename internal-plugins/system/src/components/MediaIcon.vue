<script setup>
defineProps({ name: { type: String, required: true } })
const paths = {
  compress: 'M4 4l5 5m0-5v5H4m16 11l-5-5m0 5v-5h5M15 9l5-5M4 20l5-5',
  convert: 'M4 9a8 8 0 0 1 14-4l2 3m0-5v5h-5M20 15a8 8 0 0 1-14 4l-2-3m0 5v-5h5',
  resize: 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5M8 8h8v8H8z',
  watermark: 'M5 5h14M12 5v14M8 19h8M4 9V5m16 4V5',
  corner: 'M5 20V9a4 4 0 0 1 4-4h11M9 20h11V9',
  border: 'M3 3h18v18H3zM7 7h10v10H7z',
  pad: 'M7 7h10v10H7zM2 2h20v20H2z',
  crop: 'M6 2v16h16M2 6h16v16',
  manual: 'M6 2v16h16M2 6h16v16M10 10h4v4h-4z',
  rotate: 'M5 8a8 8 0 1 1-1 7M5 3v5h5M10 10h5v5h-5z',
  flip: 'M12 2v20M3 6h5v12H3zM16 6h5v12h-5z',
  merge: 'M3 3h12v12H3zM9 19h10V9M13 23h10V13',
  pdf: 'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8m-8 4h8',
  gif: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4',
  cut: 'M8 8l12 12M8 16L20 4M3 6a3 3 0 1 0 6 0a3 3 0 0 0-6 0M3 18a3 3 0 1 0 6 0a3 3 0 0 0-6 0',
  thumbnail: 'M3 4h18v16H3zM5 17l5-6 4 4 3-3 3 5M7 8h1',
  speed: 'M4 19a10 10 0 1 1 16 0M12 12l5-5M12 12l-1 5M7 6l1 2m8-2-1 2M3 12h3m12 0h3',
  audio:
    'M9 17V4l11-2v13M9 7l11-2M3 18a3 3 0 1 0 6 0a3 3 0 0 0-6 0M14 16a3 3 0 1 0 6 0a3 3 0 0 0-6 0',
  frame: 'M4 4h16v16H4zM2 8h4m-4 8h4m12-8h4m-4 8h4M8 8h8v8H8z'
}
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.resize" />
  </svg>
</template>
