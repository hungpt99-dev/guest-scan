import { Link, useLocation } from "react-router-dom";
import { ROUTES } from "../../app/routes";

const NAV_ITEMS = [
  { label: "Home", path: ROUTES.HOME },
  { label: "OCR", path: ROUTES.OCR },
  { label: "Import Excel", path: ROUTES.IMPORT_EXCEL },
  { label: "Guests", path: ROUTES.GUESTS },
  { label: "Fill Assistant", path: ROUTES.FILL },
  { label: "Templates", path: ROUTES.TEMPLATES },
  { label: "Settings", path: ROUTES.SETTINGS },
  { label: "Logs", path: ROUTES.LOGS },
];

export default function PageHeader() {
  const location = useLocation();

  return (
    <header className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to={ROUTES.HOME} className="text-xl font-bold text-gray-900">
            GuestFill
          </Link>
          <nav className="flex space-x-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  location.pathname === item.path
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
