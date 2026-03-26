<template>
  <main class="min-h-lvh min-w-lvw flex flex-col items-center">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </main>
</template>

<style scoped>
:global(body) {
  @apply bg-white;
}

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
