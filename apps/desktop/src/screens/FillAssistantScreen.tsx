import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import ErrorMessage from "../components/common/ErrorMessage";
import {
  getCurrentGuest,
  getAllGuestRows,
  setCurrentGuest,
  saveGuestRow,
  saveFillEvent,
} from "../features/fill/fillStore";
import { copyField, getFieldsInOrder, navigateField, navigateGuest } from "../features/fill/copyAssistant";
import { DEFAULT_FIELD_ORDER } from "../features/fill/fillConstants";
import type { GuestRow, FillEvent } from "@guestfill/shared";

type FieldItem = { key: string; label: string; value: string };

export default function FillAssistantScreen() {
  const navigate = useNavigate();
  const [guest, setGuest] = useState<GuestRow | null>(getCurrentGuest());
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [copiedFields, setCopiedFields] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!guest) {
      getAllGuestRows().then((rows) => {
        setGuests(rows);
        if (rows.length > 0 && !guest) {
          const first = rows[0];
          if (first) {
            setGuest(first);
            setCurrentGuest(first);
          }
        }
      });
    } else {
      getAllGuestRows().then((rows) => setGuests(rows));
    }
  }, [guest]);

  const fields: FieldItem[] = guest ? getFieldsInOrder(guest, DEFAULT_FIELD_ORDER) : [];
  const currentField = fields[currentFieldIndex];
  const currentGuestIndex = Math.max(
    0,
    guests.findIndex((g) => g.id === (guest?.id || "")),
  );

  const getFieldValue = useCallback(
    (fieldKey: string): string => {
      if (!guest) return "";
      return String((guest as Record<string, unknown>)[fieldKey] || "");
    },
    [guest],
  );

  const handleCopyField = async (fieldKey: string) => {
    if (!guest) return;
    const value = getFieldValue(fieldKey);
    if (!value) {
      setError("Field is empty, nothing to copy.");
      return;
    }
    const success = await copyField(guest, fieldKey);
    if (success) {
      setCopiedFields((prev) => ({ ...prev, [fieldKey]: true }));
      setSuccessMsg(`Copied: ${fieldKey}`);
      setError(null);
      setTimeout(() => setSuccessMsg(null), 2000);
    } else {
      setError("Failed to copy to clipboard.");
    }
  };

  const handleNextField = () => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "next"));
  };

  const handlePrevField = () => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "prev"));
  };

  const handleNextGuest = () => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "next");
    const newGuest = guests[newIdx];
    if (newGuest) {
      setGuest(newGuest);
      setCurrentGuest(newGuest);
      setCurrentFieldIndex(0);
      setCopiedFields({});
    }
  };

  const handlePrevGuest = () => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "prev");
    const newGuest = guests[newIdx];
    if (newGuest) {
      setGuest(newGuest);
      setCurrentGuest(newGuest);
      setCurrentFieldIndex(0);
      setCopiedFields({});
    }
  };

  const handleMarkFilled = async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "FILLED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    setGuest(updated);
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "GUEST_MARKED_FILLED",
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    setSuccessMsg("Guest marked as FILLED");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleMarkSkipped = async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "SKIPPED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    setGuest(updated);
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "GUEST_MARKED_SKIPPED",
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    setSuccessMsg("Guest marked as SKIPPED");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  if (!guest) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Fill Assistant</h1>
        <Card>
          <EmptyState title="No guest selected" description="Select a guest from the Guest List first." />
          <div className="mt-4">
            <Button onClick={() => navigate(ROUTES.GUESTS)}>Go to Guest List</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fill Assistant</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Button variant="ghost" onClick={handlePrevGuest} disabled={currentGuestIndex <= 0}>
            ← Prev
          </Button>
          <span>
            Guest {currentGuestIndex + 1} of {guests.length}
          </span>
          <Button variant="ghost" onClick={handleNextGuest} disabled={currentGuestIndex >= guests.length - 1}>
            Next →
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Guest Info">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Name:</span> {guest.fullName}
              </p>
              <p>
                <span className="font-medium">Document:</span> {guest.passportNumber || guest.idNumber || "-"}
              </p>
              <p>
                <span className="font-medium">Type:</span> {guest.documentType}
              </p>
              <p>
                <span className="font-medium">Nationality:</span> {guest.nationality || "-"}
              </p>
              <p>
                <span className="font-medium">DOB:</span> {guest.dateOfBirth || "-"}
              </p>
              <p>
                <span className="font-medium">Gender:</span> {guest.gender}
              </p>
              <p>
                <span className="font-medium">Room:</span> {guest.roomNumber || "-"}
              </p>
              <p>
                <span className="font-medium">OCR Status:</span> {guest.status}
              </p>
              <p>
                <span className="font-medium">Fill Status:</span> {guest.fillStatus}
              </p>
              {guest.ocrWarning && (
                <p>
                  <span className="font-medium">Warning:</span>{" "}
                  <span className="text-yellow-700">{guest.ocrWarning}</span>
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Fields">
            {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}
            {successMsg && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{successMsg}</div>}

            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handlePrevField} disabled={currentFieldIndex <= 0}>
                  ← Prev Field
                </Button>
                <Button variant="secondary" onClick={handleNextField} disabled={currentFieldIndex >= fields.length - 1}>
                  Next Field →
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Field {currentFieldIndex + 1} of {fields.length}
              </p>
            </div>

            {currentField && (
              <div className="mb-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{currentField.label}</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">
                      {currentField.value || <span className="italic text-gray-400">Empty</span>}
                    </p>
                  </div>
                  <Button onClick={() => handleCopyField(currentField.key)} disabled={!currentField.value}>
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div
                  key={field.key}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${idx === currentFieldIndex ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-gray-50"} ${copiedFields[field.key] ? "bg-green-50" : ""}`}
                >
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">{field.label}:</span>{" "}
                    <span className="text-gray-600">
                      {field.value || <span className="italic text-gray-400">Empty</span>}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => handleCopyField(field.key)}
                    disabled={!field.value}
                    className="ml-2 text-xs"
                  >
                    {copiedFields[field.key] ? "Copied" : "Copy"}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-4 border-t pt-4">
              <Button onClick={handleMarkFilled}>Mark Filled</Button>
              <Button variant="secondary" onClick={handleMarkSkipped}>
                Mark Skipped
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
