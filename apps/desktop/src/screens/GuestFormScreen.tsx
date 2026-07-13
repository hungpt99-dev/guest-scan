import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ErrorMessage from "../components/common/ErrorMessage";
import { GUEST_FIELDS } from "../features/fill/fillConstants";
import { getGuestRow, saveGuestRow, createNewGuest } from "../features/fill/fillStore";
import type { GuestRow } from "@guestfill/shared";

export default function GuestFormScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [guest, setGuest] = useState<GuestRow>(() => createNewGuest());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && id) {
      getGuestRow(id).then((existing) => {
        if (existing) {
          setGuest(existing);
          setLoaded(true);
        } else {
          setError("Guest not found");
          setLoaded(true);
        }
      });
    }
  }, [isEdit, id]);

  const updateField = useCallback((key: string, value: string) => {
    setGuest((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }));
  }, []);

  const handleSave = async () => {
    if (!guest.fullName.trim()) {
      setError("Full Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveGuestRow(guest);
      navigate(ROUTES.GUESTS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save guest");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? "Edit Guest" : "Add Guest"}</h1>
        <Button variant="ghost" onClick={() => navigate(ROUTES.GUESTS)}>
          Back to List
        </Button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      <Card title="Guest Information">
        <div className="space-y-4">
          {GUEST_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700">
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                type={field.type ?? "text"}
                value={(guest[field.key as keyof GuestRow] as string) ?? ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update Guest" : "Add Guest"}
          </Button>
          <Button variant="secondary" onClick={() => navigate(ROUTES.GUESTS)}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
