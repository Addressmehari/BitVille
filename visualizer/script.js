document.getElementById("actionBtn").addEventListener("click", () => {
  const output = document.getElementById("output");
  output.textContent = "Button Clicked! JS is working.";
  output.style.color = "#007aff";

  // Optional: Interact with Python if configured
  if (window.pywebview) {
    window.pywebview.api.log_data("Hello from JS!");
  }
});
