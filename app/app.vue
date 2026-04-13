<template>
  <main class="min-h-dvh min-w-dvw flex flex-col items-center">
    <!-- <NuxtRouteAnnouncer /> -->
    <!-- Nuxt Pages -->
    <NuxtPage />
  </main>
</template>

<script setup lang="ts">
useHead({
  title: 'Cards Against Humanity Online',
  meta: [
    { name: 'description', content: 'Create or join a game of "Kampf gegen das Bünzlitum", the hilarious Swiss-German card game. Prove you\'re the least Bünzli of them all!' },
    // Theme color for browser UI
    { name: 'theme-color', content: '#7D8CC4' },
    // Windows Pinned Tile Color
    { name: 'msapplication-TileColor', content: '#7D8CC4' },
    // Open Graph / Facebook
    { property: 'og:title', content: 'Kampf gegen das Bünzlitum - The Swiss Card Game' },
    { property: 'og:description', content: 'Create or join a game of "Kampf gegen das Bünzlitum", the hilarious Swiss-German card game.' },
    { property: 'og:type', content: 'online multiplayer game' },
    { property: 'og:url', content: 'https://002-stuw-2.vercel.app/' }, // Replace with your actual domain
    { property: 'og:image', content: 'app/assets/img/icon-192x192.png' }, // Replace with a link to a preview image
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Kampf gegen das Bünzlitum - The Swiss Card Game' },
    { name: 'twitter:description', content: 'The hilarious Swiss-German card game. Prove you\'re the least Bünzli of them all!' },
    { name: 'twitter:image', content: '/app/assets/img/icon-192x192.png' }, // Replace with a link to a preview image
  ],
  link: [
    { rel: 'canonical', href: 'https://002-stuw-2.vercel.app/' }, // Replace with your actual domain
    { rel: 'manifest', href: '/manifest.json' }
  ]
});
</script>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 300ms ease, transform 300ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

:global(body) {
  background-color: #000;
}
</style>
