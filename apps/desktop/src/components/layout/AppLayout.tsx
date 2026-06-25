import { Outlet } from "react-router-dom";
import PageHeader from "./PageHeader";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
