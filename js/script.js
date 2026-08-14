document.addEventListener("DOMContentLoaded", () => {
  const search = document.querySelector(".search-box input");
  if (search) {
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && search.value.trim()) {
        window.location.href = "index.html?q=" + encodeURIComponent(search.value.trim());
      }
    });
  }
});
