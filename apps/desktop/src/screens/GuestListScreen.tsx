import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import LoadingState from "../components/common/LoadingState";
import ErrorMessage from "../components/common/ErrorMessage";
import { getAllGuestRows, deleteGuestRow } from "../features/fill/fillStore";
import { setCurrentGuest } from "../features/fill/fillStore";
import type { GuestRow } from "@guestfill/shared";
import type { TargetSystemTemplate } from "@guestfill/shared";
import { getTemplates } from "../features/fill/templateManager";
import { useBatchAutoFill } from "../hooks/useBatchAutoFill";

type SortField = "fullName" | "status" | "fillStatus" | "documentType" | "roomNumber";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  READY: "bg-green-100 text-green-800",
  NEED_REVIEW: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
  MISSING_DATA: "bg-orange-100 text-orange-800",
  FILLED: "bg-blue-100 text-blue-800",
  SKIPPED: "bg-gray-100 text-gray-800",
};

const FILL_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  FILLED: "bg-green-100 text-green-800",
  SKIPPED: "bg-gray-100 text-gray-800",
  FAILED: "bg-red-100 text-red-800",
};

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${onClick ? "cursor-pointer hover:text-gray-700" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function PhotoThumb({ imagePath, onClick }: { imagePath: string; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/tauri");
        const dataUrl = await invoke<string>("read_image_base64", { path: imagePath });
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  if (!src) {
    return (
      <button onClick={onClick} className="block">
        <div className="h-10 w-10 animate-pulse rounded bg-gray-200" />
      </button>
    );
  }

  return (
    <button onClick={onClick} className="block">
      <img
        src={src}
        alt=""
        className={`h-10 w-10 rounded object-cover ring-1 ring-gray-200 transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setSrc(null)}
      />
    </button>
  );
}

export default function GuestListScreen() {
  const navigate = useNavigate();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fillFilter, setFillFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("fullName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const {
    state: batchState,
    results: batchResults,
    currentIndex: batchIndex,
    totalCount: batchTotal,
    error: batchError,
    execute: executeBatch,
    abort: abortBatch,
    reset: resetBatch,
  } = useBatchAutoFill();

  const [desktopTemplates, setDesktopTemplates] = useState<TargetSystemTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const loadGuests = () => {
    setLoading(true);
    getAllGuestRows()
      .then((rows) => {
        setGuests(rows);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load guests");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadGuests();
    getTemplates().then((all) => {
      const desktop = all.filter((t) => t.type === "desktop");
      setDesktopTemplates(desktop);
      if (desktop.length > 0) {
        setSelectedTemplateId(desktop[0]!.id);
      }
    });
  }, []);

  const filtered = useMemo(() => {
    let result = [...guests];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.fullName.toLowerCase().includes(q) ||
          (g.passportNumber || "").toLowerCase().includes(q) ||
          (g.idNumber || "").toLowerCase().includes(q) ||
          (g.nationality || "").toLowerCase().includes(q) ||
          (g.roomNumber || "").toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((g) => g.status === statusFilter);
    }

    if (fillFilter !== "ALL") {
      result = result.filter((g) => g.fillStatus === fillFilter);
    }

    result.sort((a, b) => {
      const aVal = String((a as Record<string, unknown>)[sortField] || "");
      const bVal = String((b as Record<string, unknown>)[sortField] || "");
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [guests, search, statusFilter, fillFilter, sortField, sortDir]);

  useEffect(() => {
    if (batchResults.length > 0 && batchState === "completed") {
      loadGuests();
    }
  }, [batchResults, batchState]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleOpenFill = (guest: GuestRow) => {
    setCurrentGuest(guest);
    navigate(ROUTES.FILL);
  };

  const handleEdit = (guest: GuestRow) => {
    navigate(`${ROUTES.GUESTS}/edit/${guest.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGuestRow(id);
      setGuests((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete guest");
    }
  };

  const handleBatchStart = () => {
    const template = desktopTemplates.find((t) => t.id === selectedTemplateId);
    if (!template || filtered.length === 0) return;
    executeBatch(filtered, template);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const filledCount = batchResults.filter((r) => r.status === "FILLED").length;
  const failedCount = batchResults.filter((r) => r.status === "FAILED").length;

  if (loading) return <LoadingState message="Loading guests..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Guest List</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{guests.length} guests total</p>
          <Button onClick={() => navigate(`${ROUTES.GUESTS}/new`)}>Add Guest</Button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {batchError && <ErrorMessage message={batchError} />}

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Passport scan"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:text-gray-900"
              onClick={() => setLightboxImage(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {desktopTemplates.length > 0 && guests.length > 0 && (
        <Card title="Batch Auto-Fill">
          {batchState === "idle" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600">Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {desktopTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-500">
                {filtered.length} guest{filtered.length === 1 ? "" : "s"} — fills each one then submits
              </p>
              <Button onClick={handleBatchStart} disabled={filtered.length === 0}>
                Start Batch ({filtered.length})
              </Button>
            </div>
          )}

          {batchState === "running" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className="text-sm text-gray-700">
                    Processing {batchIndex + 1} of {batchTotal}...
                  </span>
                </div>
                <Button variant="secondary" onClick={abortBatch}>
                  Stop
                </Button>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${((batchIndex + 1) / batchTotal) * 100}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="text-green-600">{filledCount} filled</span>
                {failedCount > 0 && <span className="text-red-600">{failedCount} failed</span>}
              </div>
            </div>
          )}

          {batchState === "completed" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Completed
                </span>
                <span className="text-sm text-gray-600">
                  {filledCount} filled, {failedCount} failed, {batchTotal - filledCount - failedCount} skipped
                </span>
              </div>

              {batchResults.filter((r) => r.status === "FAILED").length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {batchResults
                    .filter((r) => r.status === "FAILED")
                    .map((r) => (
                      <p key={r.guestId} className="text-xs text-red-600">
                        {r.fullName}: {r.error}
                      </p>
                    ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" onClick={resetBatch}>
                  Done
                </Button>
                <Button variant="ghost" onClick={handleBatchStart}>
                  Re-run
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {guests.length === 0 && !loading && (
        <Card>
          <EmptyState
            title="No guests yet"
            description="Import an Excel file, scan passports, or add a guest manually."
          />
        </Card>
      )}

      {guests.length > 0 && (
        <Card>
          <div className="mb-4 flex flex-wrap gap-4">
            <input
              type="text"
              placeholder="Search by name, document, room..."
              className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="READY">Ready</option>
              <option value="NEED_REVIEW">Need Review</option>
              <option value="MISSING_DATA">Missing Data</option>
              <option value="FAILED">Failed</option>
              <option value="FILLED">Filled</option>
              <option value="SKIPPED">Skipped</option>
            </select>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={fillFilter}
              onChange={(e) => setFillFilter(e.target.value)}
            >
              <option value="ALL">All Fill Status</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="FILLED">Filled</option>
              <option value="SKIPPED">Skipped</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th onClick={() => toggleSort("fullName")}>
                    Full Name <SortIcon field="fullName" />
                  </Th>
                  <Th>Document</Th>
                  <Th>Nationality</Th>
                  <Th>Room</Th>
                  <Th onClick={() => toggleSort("status")}>
                    OCR Status <SortIcon field="status" />
                  </Th>
                  <Th onClick={() => toggleSort("fillStatus")}>
                    Fill Status <SortIcon field="fillStatus" />
                  </Th>
                  <Th>Photo</Th>
                  <Th>Warning</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((guest) => (
                  <tr key={guest.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{guest.fullName}</td>
                    <td className="px-3 py-2 text-gray-600">{guest.passportNumber || guest.idNumber || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{guest.nationality || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{guest.roomNumber || "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[guest.status] || ""}`}
                      >
                        {guest.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${FILL_STATUS_COLORS[guest.fillStatus] || ""}`}
                      >
                        {guest.fillStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const src = guest.sourceFile || guest.imagePath;
                        if (!src) {
                          return (
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                              -
                            </div>
                          );
                        }
                        return (
                          <PhotoThumb
                            imagePath={src}
                            onClick={() => {
                              import("@tauri-apps/api/tauri").then(({ invoke }) => {
                                invoke<string>("read_image_base64", { path: src }).then((dataUrl) => {
                                  setLightboxImage(dataUrl);
                                });
                              });
                            }}
                          />
                        );
                      })()}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-gray-500">{guest.ocrWarning || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" onClick={() => handleOpenFill(guest)}>
                          Fill
                        </Button>
                        <Button variant="ghost" onClick={() => handleEdit(guest)}>
                          Edit
                        </Button>
                        <Button variant="ghost" className="text-red-600" onClick={() => handleDelete(guest.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && <p className="py-8 text-center text-sm text-gray-400">No matching guests found.</p>}
        </Card>
      )}
    </div>
  );
}
