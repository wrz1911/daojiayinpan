#[cfg(desktop)]
use tauri::Manager;

/// 按显示器可用区域收缩窗口并居中。
///
/// 默认尺寸 620x900 来自实测:内容容器 `#mainDIV` 上限 600px,窗口宽 620 时
/// 盘面刚好铺满(主盘 484px 达最大值),再宽只是横向留白;而 1366x768 一类
/// 小屏放不下 900 高,故在此兜底收缩,下限仍受 minWidth/minHeight 约束。
#[cfg(desktop)]
fn fit_window_to_screen(app: &tauri::App) {
  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  let Ok(Some(monitor)) = window.current_monitor() else {
    return;
  };
  let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
  let width = 620.0_f64.min(screen.width - 40.0).max(440.0);
  let height = 900.0_f64.min(screen.height - 80.0).max(600.0);
  let _ = window.set_size(tauri::LogicalSize::new(width, height));
  let _ = window.center();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // 单实例限制(仅桌面端):第二个实例启动时聚焦已有窗口后自行退出,
  // 避免多开导致各实例状态不一致、竞争写盘缓存文件。
  // 插件必须最先注册,否则拦截不到第二次启动。
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.set_focus();
    }
  }));

  builder
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      #[cfg(desktop)]
      fit_window_to_screen(app);

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
