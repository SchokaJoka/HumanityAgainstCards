export const useHeaderHeight = (
  cssVariableName: string = "--sets-header-h",
) => {
  const headerEl = ref<HTMLElement | null>(null);

  const updateHeaderHeight = () => {
    const height = headerEl.value?.offsetHeight ?? 0;
    document.documentElement.style.setProperty(cssVariableName, `${height}px`);
  };

  onMounted(() => {
    // Initial calculation
    updateHeaderHeight();

    // Watch for resizes
    window.addEventListener("resize", updateHeaderHeight);

    // We can also use a ResizeObserver for more robust tracking if the header content changes
    const observer = new ResizeObserver(updateHeaderHeight);
    if (headerEl.value) {
      observer.observe(headerEl.value);
    }

    onUnmounted(() => {
      window.removeEventListener("resize", updateHeaderHeight);
      observer.disconnect();
    });
  });

  return {
    headerEl,
    updateHeaderHeight,
  };
};
