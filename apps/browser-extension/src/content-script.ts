interface WebFieldCandidate {
  selector: string;
  tagName: string;
  inputType?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  nearbyText?: string;
  visible: boolean;
  enabled: boolean;
}

function generateSelector(element: Element): string {
  if (element.id) return `#${element.id}`;
  if (element.getAttribute("name")) {
    const tag = element.tagName.toLowerCase();
    return `${tag}[name="${element.getAttribute("name")}"]`;
  }
  let path = "";
  let current: Element | null = element;
  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();
    if (current.id) {
      path = `#${current.id}`;
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((s) => s.tagName === current!.tagName);
      const idx = siblings.indexOf(current) + 1;
      if (siblings.length > 1) segment += `:nth-child(${idx})`;
    }
    path = path ? `${segment} > ${path}` : segment;
    current = parent;
  }
  return path;
}

function detectFields(): WebFieldCandidate[] {
  const candidates: WebFieldCandidate[] = [];
  const selectors = "input, textarea, select, [contenteditable='true']";
  const elements = document.querySelectorAll(selectors);

  elements.forEach((el) => {
    const input = el as HTMLInputElement;
    const label = findLabel(el);
    candidates.push({
      selector: generateSelector(el),
      tagName: el.tagName.toLowerCase(),
      inputType: (input as HTMLInputElement).type,
      name: input.name,
      id: el.id,
      label: label,
      placeholder: input.placeholder,
      ariaLabel: input.getAttribute("aria-label") || undefined,
      nearbyText: findNearbyText(el),
      visible: isVisible(el),
      enabled: !input.disabled,
    });
  });

  return candidates;
}

function findLabel(element: Element): string | undefined {
  const id = element.id;
  if (id) {
    const labelEl = document.querySelector(`label[for="${id}"]`);
    if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
  }
  const parent = element.closest("label");
  if (parent?.textContent?.trim()) return parent.textContent.trim();
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  return undefined;
}

function findNearbyText(element: Element): string | undefined {
  const parent = element.parentElement;
  if (!parent) return undefined;
  const text = parent.textContent?.trim() || "";
  const cleaned = text.replace(element.textContent || "", "").trim();
  return cleaned.length > 0 && cleaned.length < 100 ? cleaned : undefined;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function fillField(selector: string, value: string): boolean {
  try {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) return false;

    if (element.tagName === "SELECT") {
      const select = element as HTMLSelectElement;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i]?.text.includes(value) || select.options[i]?.value === value) {
          select.selectedIndex = i;
          break;
        }
      }
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else {
      const input = element as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "DETECT_FIELDS":
      sendResponse(detectFields());
      return true;
    case "FILL_FIELD":
      const result = fillField(message.selector, message.value);
      sendResponse({ success: result });
      return true;
  }
});

export {};
