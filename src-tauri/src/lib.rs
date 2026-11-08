mod commands;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 自动更新（仅桌面端；检查 / 下载 / 安装 / 重启）
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      // 打开系统默认浏览器 / 外部链接
      app.handle().plugin(tauri_plugin_opener::init())?;
      // 应用重启（更新后调用 relaunch）
      app.handle().plugin(tauri_plugin_process::init())?;
      // 恢复上次关闭时的窗口状态（位置 / 尺寸 / 最大化 / 全屏）
      window_state::restore_main_window_state(app.handle());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::bible_versions,
      commands::bible_books,
      commands::bible_load_version,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      // 退出前保存窗口状态（ExitRequested 时窗口仍存在，可读取几何信息）
      if let tauri::RunEvent::ExitRequested { .. } = event {
        window_state::save_main_window_state(app_handle);
      }
    });
}
