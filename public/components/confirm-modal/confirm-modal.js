(function () {
  let activeResolve = null;
  let activeFinish = null;

  function getModal() {
    let modal = document.getElementById("confirmModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "confirmModal";
    modal.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle" aria-describedby="confirmModalMessage">
      <div class="card-content"><p class="card-heading" id="confirmModalTitle"></p><p class="card-description" id="confirmModalMessage"></p></div>
      <div class="card-button-wrapper"><button class="card-button secondary" id="cancelBtn" type="button">Keep</button><button class="card-button primary" id="deleteBtn" type="button">Confirm</button></div>
      <button class="exit-button" id="exitBtn" type="button" aria-label="Close confirmation">×</button>
    </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  window.showConfirmModal = function ({
    title = "Are you sure?",
    message = "Please confirm this action.",
    confirmText = "Confirm",
    cancelText = "Cancel",
    tone = "danger",
  } = {}) {
    const modal = getModal();
    const titleNode = modal.querySelector(".card-heading");
    const messageNode = modal.querySelector(".card-description");
    const cancelButton = modal.querySelector("#cancelBtn");
    const confirmButton = modal.querySelector("#deleteBtn");
    const closeButton = modal.querySelector("#exitBtn");
    if (activeFinish) activeFinish(false);
    titleNode.textContent = title;
    messageNode.textContent = message;
    cancelButton.textContent = cancelText;
    confirmButton.textContent = confirmText;
    confirmButton.classList.toggle("confirm-modal-primary", tone === "primary");
    modal.classList.add("show");

    return new Promise((resolve) => {
      activeResolve = resolve;
      const finish = (confirmed) => {
        if (!activeResolve) return;
        modal.classList.remove("show");
        cancelButton.removeEventListener("click", onCancel);
        confirmButton.removeEventListener("click", onConfirm);
        closeButton?.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeydown);
        const done = activeResolve;
        activeResolve = null;
        activeFinish = null;
        done(confirmed);
      };
      const onCancel = () => finish(false);
      const onConfirm = () => finish(true);
      const onBackdrop = (event) => {
        if (event.target === modal) finish(false);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") finish(false);
      };
      activeFinish = finish;
      cancelButton.addEventListener("click", onCancel);
      confirmButton.addEventListener("click", onConfirm);
      closeButton?.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeydown);
      requestAnimationFrame(() => (confirmButton || cancelButton).focus());
    });
  };
})();