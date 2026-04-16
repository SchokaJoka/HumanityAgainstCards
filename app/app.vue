<template>
  <main class="min-h-dvh min-w-dvw flex flex-col items-center">
    <!-- <NuxtRouteAnnouncer /> -->
    <!-- Nuxt Pages -->
    <NuxtPage />
  </main>
</template>

<script setup lang="ts">
const siteUrl = 'https://humanityagainstcards.vercel.app';
const siteName = 'Humanity Against Cards';
const siteDescription = 'Play Humanity Against Cards Online with Friends';
const socialImageUrl = `${siteUrl}/icons/icon-512x512.png`;

useHead({
  title: `${siteName} - Online`,
  titleTemplate: (titleChunk) => {
    return titleChunk ? `${titleChunk} | ${siteName}` : `${siteName} - Online`;
  },
  htmlAttrs: {
    lang: 'en'
  },
  meta: [
    { name: 'description', content: siteDescription },
    { name: 'robots', content: 'index, follow' },
    { name: 'theme-color', content: '#000000' },
    // Open Graph / Facebook
    { property: 'og:site_name', content: siteName },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:title', content: siteName },
    { property: 'og:description', content: siteDescription },
    { property: 'og:type', content: 'online multiplayer game' },
    { property: 'og:url', content: `${siteUrl}/` },
    { property: 'og:image', content: socialImageUrl },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: '512' },
    { property: 'og:image:height', content: '512' },
    { property: 'og:image:alt', content: 'Humanity Against Cards logo' },
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: siteName },
    { name: 'twitter:description', content: siteDescription },
    { name: 'twitter:url', content: `${siteUrl}/` },
    { name: 'twitter:image', content: socialImageUrl },
  ],
  link: [
    { rel: 'canonical', href: `${siteUrl}/` },
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/icons/icon-192x192.png' },
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
