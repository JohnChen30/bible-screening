import { Navigate, Route, Routes } from 'react-router-dom';
import { ConsolePage } from '@/routes/console-page';
import { OutputPage } from '@/components/projection/output-page';

/**
 * App — 路由
 *   /console  主控台（Miller Columns + 阅读区 + 投影控制）
 *   /output   投影输出（无边框全屏，仅经文；桌面端由 Tauri 第二窗口承载）
 */
export default function App() {
  return (
    <Routes>
      <Route path="/console" element={<ConsolePage />} />
      <Route path="/output" element={<OutputPage />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  );
}
