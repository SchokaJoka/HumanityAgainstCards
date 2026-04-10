<template>
  <main class="min-h-dvh min-w-dvw flex flex-col items-center">
    <!-- <NuxtRouteAnnouncer /> -->
    <!-- Nuxt Pages -->
    <NuxtPage />
  </main>
</template>

<script setup lang="ts">
useHead({
  title: 'Kampf gegen das Bünzlitum - The Swiss Card Game',
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
    { property: 'og:url', content: 'https://www.your-website.com/' }, // Replace with your actual domain
    { property: 'og:image', content: 'https://www.your-website.com/og-image.png' }, // Replace with a link to a preview image
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Kampf gegen das Bünzlitum - The Swiss Card Game' },
    { name: 'twitter:description', content: 'The hilarious Swiss-German card game. Prove you\'re the least Bünzli of them all!' },
    { name: 'twitter:image', content: 'https://www.your-website.com/twitter-image.png' }, // Replace with a link to a preview image
  ],
  link: [
    { rel: 'canonical', href: 'https://www.your-website.com/' } // Replace with your actual domain
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
</style>
