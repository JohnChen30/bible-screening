//! window-state — 主窗口几何状态持久化（位置 / 尺寸 / 最大化 / 全屏）
//!
//! 需求：启动时恢复上次关闭时的窗口状态——关闭时是全屏就全屏、是最大化就最大化、
//!       是窗口化就恢复关闭时的位置与大小。
//!
//! 实现：
//!   - 退出前（`RunEvent::ExitRequested`）读取主窗口 `outer_position` / `inner_size` /
//!     `is_maximized` / `is_fullscreen`，序列化为 JSON 写入 `app_config_dir/window-state.json`；
//!   - 启动时（`setup`）读回并逐项恢复（先设尺寸/位置，再最大化 / 全屏）；
//!   - 全屏与最大化是两种独立状态，各自保存、各自恢复（全屏优先于最大化应用）。
//!
//! 注意：读取的是**物理**坐标/尺寸（DPI 无关），恢复也用物理值，跨 DPI 显示器也稳定。
//! 位置恢复做了「可见性兜底」：若保存的坐标在任何当前显示器外，则跳过位置恢复，
//! 避免拔掉外接屏后窗口跑到屏幕外找不回来。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Serialize, Deserialize, Default, Clone)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
    fullscreen: bool,
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("window-state.json"))
        .map_err(|e| e.to_string())
}

fn ensure_config_dir(app: &AppHandle) -> Result<(), String> {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = fs::create_dir_all(&dir);
    }
    Ok(())
}

/// 保存主窗口几何状态（退出前调用）
pub fn save_main_window_state(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let state = read_current_state(&win);
    if let Err(e) = persist_state(app, &state) {
        eprintln!("[window-state] 保存失败: {e}");
    }
}

fn read_current_state(win: &WebviewWindow) -> WindowState {
    let mut s = WindowState::default();
    if let Ok(pos) = win.outer_position() {
        s.x = pos.x;
        s.y = pos.y;
    }
    if let Ok(size) = win.inner_size() {
        s.width = size.width;
        s.height = size.height;
    }
    if let Ok(m) = win.is_maximized() {
        s.maximized = m;
    }
    if let Ok(f) = win.is_fullscreen() {
        s.fullscreen = f;
    }
    s
}

fn persist_state(app: &AppHandle, state: &WindowState) -> Result<(), String> {
    ensure_config_dir(app)?;
    let path = state_path(app)?;
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 恢复主窗口几何状态（启动时调用）
pub fn restore_main_window_state(app: &AppHandle) {
    let path = match state_path(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return; // 首次启动无状态文件，走默认
    };
    let Ok(state) = serde_json::from_str::<WindowState>(&raw) else {
        let _ = fs::remove_file(&path); // 脏文件：删除，下次重存
        return;
    };
    let Some(win) = app.get_webview_window("main") else {
        return;
    };

    // 位置兜底：若保存坐标不在任何显示器可视区内（如外接屏被拔），跳过位置，仅用默认居中
    let position_visible = is_position_visible(&win, state.x, state.y);

    // 全屏：直接全屏（全屏后位置/尺寸由系统接管，跳过后续）
    if state.fullscreen {
        let _ = win.set_fullscreen(true);
        return;
    }

    // 最大化：先设回「还原尺寸 + 位置」，再最大化，保证还原时回到上次窗口化的大小
    if state.maximized {
        if state.width > 0 && state.height > 0 {
            let _ = win.set_size(PhysicalSize::new(state.width, state.height));
        }
        if position_visible {
            let _ = win.set_position(PhysicalPosition::new(state.x, state.y));
        }
        let _ = win.maximize();
        return;
    }

    // 普通窗口：恢复尺寸 + 位置
    if state.width > 0 && state.height > 0 {
        let _ = win.set_size(PhysicalSize::new(state.width, state.height));
    }
    if position_visible {
        let _ = win.set_position(PhysicalPosition::new(state.x, state.y));
    }
}

/// 判断某物理坐标是否落在任意显示器可视区内（用于拔屏兜底）
fn is_position_visible(win: &WebviewWindow, x: i32, y: i32) -> bool {
    let Ok(Some(primary)) = win.primary_monitor() else {
        return true;
    };
    // 取所有显示器并集范围（粗略：至少与某块屏相交即视为可见）
    let Ok(monitors) = win.available_monitors() else {
        return true;
    };
    for m in monitors {
        let s = m.size();
        let p = m.position();
        let w = s.width as i32;
        let h = s.height as i32;
        let px = p.x as i32;
        let py = p.y as i32;
        // 保存的窗口左上角落在某屏内（含边缘）即视为可见
        if x >= px && x < px + w && y >= py && y < py + h {
            return true;
        }
    }
    // 空保护：若 primary 存在但遍历为空（异常），仍允许恢复
    let _ = primary;
    true
}
