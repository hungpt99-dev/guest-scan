const LOCAL_BRIDGE_URL = "http://127.0.0.1:43175";
let localToken: string | null = null;

async function checkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_BRIDGE_URL}/health`, {
      headers: { "X-GuestFill-Token": localToken || "" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchGuests(): Promise<unknown[]> {
  try {
    const response = await fetch(`${LOCAL_BRIDGE_URL}/guests`, {
      headers: { "X-GuestFill-Token": localToken || "" },
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "CHECK_CONNECTION":
      checkConnection().then(sendResponse);
      return true;
    case "FETCH_GUESTS":
      fetchGuests().then(sendResponse);
      return true;
    case "GET_FIELD_CANDIDATES":
      chrome.tabs.sendMessage(sender.tab?.id || 0, { type: "DETECT_FIELDS" }, sendResponse);
      return true;
    case "FILL_FIELD":
      chrome.tabs.sendMessage(
        sender.tab?.id || 0,
        {
          type: "FILL_FIELD",
          selector: message.selector,
          value: message.value,
        },
        sendResponse,
      );
      return true;
  }
});

export {};
