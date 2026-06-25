import { Routes, Route } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import HomeScreen from "../screens/HomeScreen";
import OcrScreen from "../screens/OcrScreen";
import ImportExcelScreen from "../screens/ImportExcelScreen";
import GuestListScreen from "../screens/GuestListScreen";
import FillAssistantScreen from "../screens/FillAssistantScreen";
import TemplateManagerScreen from "../screens/TemplateManagerScreen";
import SettingsScreen from "../screens/SettingsScreen";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/ocr" element={<OcrScreen />} />
        <Route path="/import-excel" element={<ImportExcelScreen />} />
        <Route path="/guests" element={<GuestListScreen />} />
        <Route path="/fill" element={<FillAssistantScreen />} />
        <Route path="/fill-assistant" element={<FillAssistantScreen />} />
        <Route path="/templates" element={<TemplateManagerScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>
    </Routes>
  );
}
