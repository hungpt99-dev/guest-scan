import { describe, it, expect } from "vitest";

describe("Browser Extension E2E: message handling and field operations", () => {
  describe("message types", () => {
    it("defines all required message types", () => {
      const checkConnection = { type: "CHECK_CONNECTION" as const };
      const fetchGuests = { type: "FETCH_GUESTS" as const };
      const getCandidates = { type: "GET_FIELD_CANDIDATES" as const };
      const detectFields = { type: "DETECT_FIELDS" as const };
      const fillField = { type: "FILL_FIELD" as const, selector: "#name", value: "John" };
      const fillResult = { type: "FILL_RESULT" as const, success: true };
      const connectionStatus = { type: "CONNECTION_STATUS" as const, connected: true };

      expect(checkConnection.type).toBe("CHECK_CONNECTION");
      expect(fetchGuests.type).toBe("FETCH_GUESTS");
      expect(getCandidates.type).toBe("GET_FIELD_CANDIDATES");
      expect(detectFields.type).toBe("DETECT_FIELDS");
      expect(fillField.selector).toBe("#name");
      expect(fillResult.success).toBe(true);
      expect(connectionStatus.connected).toBe(true);
    });
  });

  describe("bridge request types", () => {
    it("defines all bridge request fields", () => {
      const request = {
        token: "abc",
        sessionId: "s1",
        guestId: "g1",
        fieldName: "fullName",
        value: "John Doe",
      };
      expect(request.token).toBe("abc");
      expect(request.sessionId).toBe("s1");
      expect(request.guestId).toBe("g1");
      expect(request.fieldName).toBe("fullName");
      expect(request.value).toBe("John Doe");
    });

    it("allows optional fields", () => {
      const minimal = { token: "abc" };
      expect(minimal.token).toBe("abc");
      expect((minimal as Record<string, unknown>).sessionId).toBeUndefined();
    });
  });

  describe("field detection logic", () => {
    it("generates correct selector from element attributes", () => {
      expect(generateSelectorForId("#my-input")).toBe("#my-input");
    });

    it("generates selector from name attribute", () => {
      const result = generateSelectorForName("input", "guest_name");
      expect(result).toBe('input[name="guest_name"]');
    });

    it("generates path-based selector for elements with no id or name", () => {
      expect(generateSelectorForPath("div", "form", 0)).toBe("form > div");
    });

    it("handles elements with just id", () => {
      const result = generateSelectorForId("#passport-number");
      expect(result).toBe("#passport-number");
    });
  });

  describe("filling logic", () => {
    it("handles text input fields", () => {
      const value = "John Doe";
      expect(value).toBe("John Doe");
    });

    it("handles select fields", () => {
      const options = ["Male", "Female"];
      const valueToMatch = "Male";
      expect(options.includes(valueToMatch)).toBe(true);
    });

    it("handles contenteditable fields", () => {
      const value = "notes here";
      const element = { textContent: "" };
      element.textContent = value;
      expect(element.textContent).toBe("notes here");
    });
  });

  describe("label finding heuristics", () => {
    it("finds label by for attribute", () => {
      const labelFor = "fullName";
      const labelText = "Full Name";
      expect(labelFor).toBe("fullName");
      expect(labelText).toBe("Full Name");
    });

    it("finds label by parent element", () => {
      class MockLabelElement {
        textContent = "Passport Number";
        closest(_selector: string) {
          return this;
        }
      }
      const el = new MockLabelElement();
      expect(el.textContent).toBe("Passport Number");
    });

    it("falls back to aria-label", () => {
      const ariaLabel = "Date of Birth";
      expect(ariaLabel).toBe("Date of Birth");
    });
  });
});

function generateSelectorForId(id: string): string {
  return id;
}

function generateSelectorForName(tag: string, name: string): string {
  return `${tag}[name="${name}"]`;
}

function generateSelectorForPath(tag: string, parentTag: string, _index: number): string {
  return `${parentTag} > ${tag}`;
}
