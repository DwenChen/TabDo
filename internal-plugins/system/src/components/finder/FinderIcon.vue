<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
  strokeWidth: { type: Number, default: 1.8 }
})
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'settings'">
      <path
        d="m9 3-.6 3-2.6 1-2.5-1.3-2 3.5 2 2.1v3L1.5 16l2 3.5L6 18.2l2.6 1L9 22h4l.6-2.8 2.6-1 2.5 1.3 2-3.5-2-1.7v-3l2-2.1-2-3.5-2.5 1.3-2.6-1L13 3z"
      />
      <circle cx="11" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'grip'">
      <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3" />
    </template>
    <path v-else-if="name === 'reset'" d="M3 10a9 9 0 1 1 2 8M3 3v7h7" />
    <path v-else-if="name === 'sort'" d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4" />
    <path v-else-if="name === 'check'" d="m5 12 4 4L20 5" />
    <path v-else d="m6 9 6 6 6-6" />
  </svg>
</template>
