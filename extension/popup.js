document.getElementById("check").addEventListener("click", async () => {
  const status = document.getElementById("status");

  try {
    const response = await fetch("http://127.0.0.1:5050/health");
    const data = await response.json();

    if (data.status === "running") {
      status.innerText = "Backend is running successfully";
    } else {
      status.innerText = "Backend is not responding correctly";
    }
  } catch (error) {
    status.innerText = "Backend is not running. Start start_bot.bat";
  }
});