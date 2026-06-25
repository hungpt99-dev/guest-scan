import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";

export default function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">GuestFill</h1>
        <p className="mt-2 text-gray-600">Convert passport/ID documents into reviewed guest data</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <button
            onClick={() => navigate(ROUTES.OCR)}
            className="flex h-full w-full flex-col items-center justify-center py-12"
          >
            <h2 className="text-xl font-semibold text-blue-600">Create Excel from Documents</h2>
            <p className="mt-2 text-sm text-gray-500">Select passport/ID files, run OCR, and export reviewed Excel</p>
          </button>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <button
            onClick={() => navigate(ROUTES.IMPORT_EXCEL)}
            className="flex h-full w-full flex-col items-center justify-center py-12"
          >
            <h2 className="text-xl font-semibold text-green-600">Import Excel to Fill Guest Info</h2>
            <p className="mt-2 text-sm text-gray-500">
              Import reviewed Excel and fill guest information into hotel systems
            </p>
          </button>
        </Card>
      </div>
    </div>
  );
}
