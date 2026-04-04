export function resetAppData() {
  localStorage.clear();
  window.location.reload();
}

window.resetBoitekongPlusApp = resetAppData;