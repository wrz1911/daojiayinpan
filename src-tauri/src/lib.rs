#[cfg(desktop)]
use tauri::Manager;

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
