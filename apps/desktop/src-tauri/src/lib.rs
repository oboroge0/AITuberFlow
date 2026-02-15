use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

/// State to hold the sidecar child process for cleanup
struct ServerProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
struct ServerPort(Mutex<u16>);

/// Navigate the main window to the server URL once it's ready
fn navigate_to_server(app: &tauri::AppHandle, port: u16) {
    let url = format!("http://localhost:{}", port);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(url.parse().unwrap());
    }
}

fn resolve_resource_path(resource_dir: &Path, resource_name: &str) -> PathBuf {
    let bundled = resource_dir.join(resource_name);
    if bundled.exists() {
        return bundled;
    }

    // In tauri dev, resources are not always under runtime resource_dir.
    // Fallback to src-tauri/resources where copy-resources.js puts assets.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(resource_name)
}

fn extract_port_from_server_log(line: &str) -> Option<u16> {
    let trimmed = line.trim();
    if !(trimmed.contains("Started development server:") || trimmed.contains("Started server:")) {
        return None;
    }

    let url = trimmed.split_whitespace().last()?;
    let without_scheme = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .unwrap_or(url);
    let host_and_port = without_scheme.split('/').next()?;
    let (_, port) = host_and_port.rsplit_once(':')?;
    port.parse::<u16>().ok()
}

fn reserve_dynamic_port() -> Option<(u16, TcpListener)> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).ok()?;
    let port = listener.local_addr().ok()?.port();
    Some((port, listener))
}

fn sanitize_window_label_suffix(input: &str) -> String {
    let mut label = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            label.push(ch);
        } else {
            label.push('-');
        }
    }
    if label.is_empty() {
        "default".to_string()
    } else {
        label
    }
}

fn sanitize_export_filename(input: &str) -> String {
    let mut name = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            name.push(ch);
        } else {
            name.push('_');
        }
    }
    let name = name.trim_matches('.');
    if name.is_empty() {
        "workflow-export.json".to_string()
    } else if name.ends_with(".json") {
        name.to_string()
    } else {
        format!("{}.json", name)
    }
}

#[tauri::command]
async fn open_overlay_window(app: tauri::AppHandle, workflow_id: String) -> Result<(), String> {
    let workflow_id = workflow_id.trim().to_string();
    if workflow_id.is_empty() || workflow_id == "_" {
        return Err("invalid workflow id".to_string());
    }

    let port = *app
        .state::<ServerPort>()
        .0
        .lock()
        .map_err(|_| "failed to read server port".to_string())?;
    let url = format!("http://localhost:{}/overlay/{}", port, workflow_id);
    let parsed_url: tauri::Url = url
        .parse()
        .map_err(|err| format!("invalid overlay url: {}", err))?;
    let label = format!("overlay-{}", sanitize_window_label_suffix(&workflow_id));

    if let Some(existing) = app.get_webview_window(&label) {
        existing
            .navigate(parsed_url)
            .map_err(|err| format!("failed to navigate overlay window: {}", err))?;
        existing
            .show()
            .map_err(|err| format!("failed to show overlay window: {}", err))?;
        existing
            .set_focus()
            .map_err(|err| format!("failed to focus overlay window: {}", err))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url))
        .title(format!("Overlay - {}", workflow_id))
        .inner_size(1280.0, 720.0)
        .min_inner_size(640.0, 360.0)
        .resizable(true)
        .build()
        .map_err(|err| format!("failed to create overlay window: {}", err))?;

    Ok(())
}

#[tauri::command]
fn save_workflow_export(
    app: tauri::AppHandle,
    filename: String,
    content: String,
) -> Result<String, String> {
    let safe_name = sanitize_export_filename(&filename);
    let base_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().desktop_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|err| format!("failed to resolve export directory: {}", err))?;
    std::fs::create_dir_all(&base_dir)
        .map_err(|err| format!("failed to create export directory: {}", err))?;

    let mut target = base_dir.join(&safe_name);
    if target.exists() {
        let stem = target
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or("workflow-export");
        let unique_name = format!("{}-{}.json", stem, chrono_like_timestamp());
        target = base_dir.join(unique_name);
    }

    std::fs::write(&target, content.as_bytes())
        .map_err(|err| format!("failed to write export file: {}", err))?;
    Ok(target.display().to_string())
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerProcess(Mutex::new(None)))
        .manage(ServerPort(Mutex::new(8001)))
        .invoke_handler(tauri::generate_handler![
            open_overlay_window,
            save_workflow_export
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let fixed_port = std::env::var("AITUBERFLOW_PORT")
                .ok()
                .and_then(|value| value.parse::<u16>().ok());
            let (port, reservation) = if let Some(port) = fixed_port {
                println!("[desktop] using fixed server port: {}", port);
                (port, None)
            } else if let Some((port, reservation)) = reserve_dynamic_port() {
                println!("[desktop] reserved dynamic server port: {}", port);
                (port, Some(reservation))
            } else {
                println!("[desktop] failed to reserve dynamic port, falling back to 8001");
                (8001, None)
            };
            *handle.state::<ServerPort>().0.lock().unwrap() = port;

            // Resolve resource paths for the sidecar environment
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            // Ensure app data directories exist
            let _ = std::fs::create_dir_all(&app_data_dir);
            let audio_dir = app_data_dir.join("audio_output");
            let _ = std::fs::create_dir_all(&audio_dir);
            let upload_dir = app_data_dir.join("models");
            let _ = std::fs::create_dir_all(&upload_dir);
            let animations_dir = app_data_dir.join("animations");
            let _ = std::fs::create_dir_all(&animations_dir);

            // Build environment variables for the sidecar
            let db_path = app_data_dir.join("aituberflow.db");
            let plugins_dir = resolve_resource_path(&resource_dir, "plugins");
            let templates_dir = resolve_resource_path(&resource_dir, "templates");
            let static_dir = resolve_resource_path(&resource_dir, "web-dist");
            println!(
                "[desktop] resources: plugins={}, templates={}, static={}",
                plugins_dir.display(),
                templates_dir.display(),
                static_dir.display()
            );

            // Spawn the Bun server sidecar
            let shell = handle.shell();
            let (mut rx, child) = shell
                .sidecar("server")
                .expect("failed to create sidecar command")
                .env("PORT", port.to_string())
                .env("DATABASE_URL", db_path.to_string_lossy().to_string())
                .env("PLUGINS_DIR", plugins_dir.to_string_lossy().to_string())
                .env("TEMPLATES_DIR", templates_dir.to_string_lossy().to_string())
                .env("STATIC_DIR", static_dir.to_string_lossy().to_string())
                .env("UPLOAD_DIR", upload_dir.to_string_lossy().to_string())
                .env("ANIMATIONS_DIR", animations_dir.to_string_lossy().to_string())
                .env("AUDIO_DIR", audio_dir.to_string_lossy().to_string())
                .spawn()
                .expect("failed to spawn sidecar");
            drop(reservation);

            // Store the child process for cleanup
            let state = handle.state::<ServerProcess>();
            *state.0.lock().unwrap() = Some(child);

            // Monitor stdout for server ready signal, then navigate
            let handle_clone = handle.clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                let mut navigated = false;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line);
                            println!("[server] {}", text);
                            if !navigated {
                                if let Some(actual_port) = extract_port_from_server_log(&text) {
                                    println!("[desktop] detected server port: {}", actual_port);
                                    *handle_clone.state::<ServerPort>().0.lock().unwrap() = actual_port;
                                    navigate_to_server(&handle_clone, actual_port);
                                    navigated = true;
                                } else if text.contains("Started development server:")
                                    || text.contains("Started server:")
                                {
                                    println!(
                                        "[desktop] server ready, falling back to configured port: {}",
                                        port
                                    );
                                    navigate_to_server(&handle_clone, port);
                                    navigated = true;
                                }
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[server:err] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("[server] terminated with status: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill sidecar only when the main window is closed.
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<ServerProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
