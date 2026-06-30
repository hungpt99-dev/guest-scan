import LogTab from "../components/common/LogTab";

export default function LogScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Logs</h1>
      <LogTab />
    </div>
  );
}
