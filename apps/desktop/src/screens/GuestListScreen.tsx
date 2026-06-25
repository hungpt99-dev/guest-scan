import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import LoadingState from "../components/common/LoadingState";
import { getAllGuestRows } from "../features/fill/fillStore";
import { setCurrentGuest } from "../features/fill/fillStore";
import type { GuestRow } from "@guestfill/shared";

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

export default function GuestListScreen() {
  const navigate = useNavigate();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fillFilter, setFillFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("fullName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    getAllGuestRows().then((rows) => {
      setGuests(rows);
      setLoading(false);
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

  if (loading) return <LoadingState message="Loading guests..." />;

  if (guests.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Guest List</h1>
        <Card>
          <EmptyState title="No guests yet" description="Import a reviewed Excel file to see guest data here." />
        </Card>
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Guest List</h1>
        <p className="text-sm text-gray-500">{guests.length} guests total</p>
      </div>

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
                <Th>Warning</Th>
                <Th>Action</Th>
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
                  <td className="max-w-[150px] truncate px-3 py-2 text-gray-500">{guest.ocrWarning || "-"}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" onClick={() => handleOpenFill(guest)}>
                      Fill
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && <p className="py-8 text-center text-sm text-gray-400">No matching guests found.</p>}
      </Card>
    </div>
  );
}

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
