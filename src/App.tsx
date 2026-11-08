import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ConsolePage } from '@/routes/console-page';
import { OutputPage } from '@/components/projection/output-page';
import { checkForUpdate } from '@/lib/app-updater';
import { useUpdaterStore } from '@/stores/use-updater-store';

/**
 * App — 路由
 *   /console  主控台（Miller Columns + 阅读区 + 投影控制）
 *   /output   投影输出（无边框全屏，仅经文；桌面端由 Tauri 第二窗口承载）
 */
export default function App() {
  // 启动时后台静默检查更新（仅 Tauri 桌面端；有更新则右下角出现「更新」按钮）
  useEffect(() => {
    void checkForUpdate().then((u) => {
      if (u) useUpdaterStore.getState().setUpdate(u);
    });
  }, []);

  return (
    <Routes>
      <Route path="/console" element={<ConsolePage />} />
      <Route path="/output" element={<OutputPage />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  );
}
