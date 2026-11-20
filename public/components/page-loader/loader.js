// loader.js
(function () {
  const TRANSITION_DURATION = 220; // in ms
  const HIDE_DELAY = 1000; // delay before hiding the loader
  const AUTO_MIN_VISIBLE = 300; // give the progress state time to register
  let hideTimeout = null;

  /**
   * Creates and injects loader HTML if it doesn't exist
   */
  function injectLoader() {
    if (document.getElementById("page-loader")) return;

    const loader = document.createElement("div");
    loader.id = "page-loader";
    loader.innerHTML = `
      <div class="glass-card">
        <div class="spinner"></div>
        <p class="loading-text">Loading, Please Wait...</p>
      </div>
    `;
    document.body.prepend(loader);

    // Hide initially
    loader.style.display = "none";
    loader.style.opacity = "0";
  }

  /**
   * Show loader immediately
   * 
   */
  function showLoader(message = "Loading, Please Wait...") {
    injectLoader();
    const loader = document.getElementById("page-loader");
    const text = loader.querySelector(".loading-text");

    if (text) text.textContent = message;

    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    loader.style.display = "flex";
    requestAnimationFrame(() => {
      loader.style.opacity = "1";
    });
  }

  /**
   * Hide loader with delay
   * @param {number} delay
   */
  function hideLoader(delay = HIDE_DELAY) {
    const loader = document.getElementById("page-loader");
    if (!loader) return;

    hideTimeout = setTimeout(() => {
      loader.style.opacity = "0";
      setTimeout(() => {
        loader.style.display = "none";
        hideTimeout = null;
      }, TRANSITION_DURATION);
    }, delay);
  }

  /** Show automatically during each page load. */
  function enableAutoLoader() {
    const shownAt = Date.now();
    showLoader();
    const hideAfterLoad = () => {
      hideLoader(Math.max(0, AUTO_MIN_VISIBLE - (Date.now() - shownAt)));
    };
    if (document.readyState === "complete") hideAfterLoad();
    else window.addEventListener("load", hideAfterLoad, { once: true });
  }

  // Expose globally
  window.PageLoader = {
    show: showLoader,
    hide: hideLoader,
    auto: enableAutoLoader
  };

  // Show on every page; a short minimum display prevents an imperceptible flash.
  enableAutoLoader();
})();