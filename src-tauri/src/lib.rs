use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

// 使用 Mutex 替代 unsafe static mut，避免未定义行为
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[tauri::command]
fn select_data_folder() -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("powershell")
        .args(["-Command", "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择数据存储文件夹'; if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath } else { '' }"])
        .output()
        .map_err(|e| e.to_string())?;
    
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Err("未选择文件夹".to_string())
    } else {
        Ok(path)
    }
}

#[tauri::command]
fn get_data_folder() -> Result<String, String> {
    let app_data = dirs::data_local_dir()
        .ok_or("无法获取应用数据目录")?;
    let data_folder = app_data.join("焱超视频工具");
    
    if !data_folder.exists() {
        fs::create_dir_all(&data_folder).map_err(|e| e.to_string())?;
    }
    
    Ok(data_folder.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_folder_exists(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_file(path: String, data: Vec<u8>, filename: String) -> Result<String, String> {
    let full_path = PathBuf::from(&path).join(&filename);
    fs::write(&full_path, data).map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_files(dir: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    Ok(files)
}

/// 检测端口是否被占用
fn is_port_in_use(port: u16) -> bool {
    use std::net::TcpListener;
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

/// 在生产模式下使用内嵌的 node.exe 启动 Next.js standalone server
fn start_nextjs_server(resource_dir: &std::path::Path) -> Result<Child, String> {
    // 检测端口是否被占用
    if is_port_in_use(5000) {
        return Err("端口 5000 已被占用，请关闭占用该端口的程序后重试".to_string());
    }

    let node_path = resource_dir.join("node.exe");
    let server_path = resource_dir.join("server").join("server.js");
    
    if !node_path.exists() {
        return Err(format!(
            "找不到内嵌的 Node.js 运行时: {:?}\n请重新安装应用。",
            node_path
        ));
    }
    
    if !server_path.exists() {
        return Err(format!(
            "找不到服务器文件: {:?}\n请重新安装应用。",
            server_path
        ));
    }
    
    println!("[启动器] 正在启动 Next.js 服务器...");
    println!("[启动器] Node.js: {:?}", node_path);
    println!("[启动器] 服务端: {:?}", server_path);
    
    // Windows 下使用 CREATE_NO_WINDOW 标志，避免弹出黑色控制台窗口
    #[cfg(target_os = "windows")]
    let child = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(&node_path)
            .arg(&server_path)
            .env("PORT", "5000")
            .env("HOSTNAME", "localhost")
            .env("COZE_PROJECT_ENV", "PROD")
            .current_dir(resource_dir.join("server"))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("启动服务器失败: {}", e))?
    };
    
    #[cfg(not(target_os = "windows"))]
    let child = Command::new(&node_path)
        .arg(&server_path)
        .env("PORT", "5000")
        .env("HOSTNAME", "localhost")
        .env("COZE_PROJECT_ENV", "PROD")
        .current_dir(resource_dir.join("server"))
        .spawn()
        .map_err(|e| format!("启动服务器失败: {}", e))?;
    
    println!("[启动器] Next.js 服务器已启动 (PID: {:?})", child.id());
    Ok(child)
}

/// 在后台线程中等待服务器就绪，然后通知前端跳转
fn wait_for_server_and_navigate(app_handle: tauri::AppHandle) {
    println!("[启动器] 等待服务器就绪...");
    
    // 先等待 2 秒，给服务器启动时间
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    for i in 0..60 {
        if let Ok(resp) = reqwest::blocking::get("http://localhost:5000") {
            if resp.status().is_success() || resp.status().as_u16() == 307 {
                println!("[启动器] 服务器已就绪！耗时约 {}s", i + 2);
                // 通知前端跳转
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.eval("window.location.href = 'http://localhost:5000';");
                }
                return;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    
    println!("[启动器] 警告：服务器启动超时（30秒）");
    // 通知前端显示超时提示
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.eval("document.getElementById('status').textContent = '启动超时，请关闭占用端口 5000 的程序，然后重启应用';");
    }
}

/// 杀死进程及其子进程（Windows 下使用 taskkill /T 杀进程树）
fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    println!("[启动器] 正在终止服务器进程 (PID: {})...", pid);
    
    #[cfg(target_os = "windows")]
    {
        // Windows: 使用 taskkill /F /T /PID 强制终止进程树（包含子进程）
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn();
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = child.kill();
    }
    
    let _ = child.wait(); // 回收资源
    println!("[启动器] 服务器进程已终止");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            select_data_folder,
            get_data_folder,
            ensure_folder_exists,
            save_file,
            read_file_bytes,
            delete_file,
            list_files
        ])
        .setup(|app| {
            // 初始化数据文件夹
            if let Some(app_data) = dirs::data_local_dir() {
                let data_folder = app_data.join("焱超视频工具");
                if !data_folder.exists() {
                    let _ = fs::create_dir_all(&data_folder);
                }
                
                let folders = ["projects", "assets", "database"];
                for folder in folders {
                    let sub_folder = data_folder.join(folder);
                    if !sub_folder.exists() {
                        let _ = fs::create_dir_all(&sub_folder);
                    }
                }
            }

            // 生产模式：使用内嵌 node.exe 启动 Next.js standalone server
            if !cfg!(debug_assertions) {
                let resolve_dir = app.path().resource_dir().expect("无法获取资源目录");
                println!("[启动器] 资源目录: {:?}", resolve_dir);
                
                match start_nextjs_server(&resolve_dir) {
                    Ok(child) => {
                        // 保存子进程引用
                        if let Ok(mut guard) = SERVER_PROCESS.lock() {
                            *guard = Some(child);
                        }
                        
                        // 在后台线程中等待服务器就绪（不阻塞主线程）
                        let app_handle = app.handle().clone();
                        std::thread::spawn(move || {
                            wait_for_server_and_navigate(app_handle);
                        });
                    }
                    Err(e) => {
                        eprintln!("[启动器] 启动服务器失败: {}", e);
                        // 通知前端显示错误
                        if let Some(window) = app.get_webview_window("main") {
                            let err_msg = e.replace('\'', "\\'");
                            let _ = window.eval(&format!(
                                "document.getElementById('status').textContent = '{}';",
                                err_msg
                            ));
                        }
                    }
                }
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            // 窗口关闭时清理服务器进程
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut guard) = SERVER_PROCESS.lock() {
                    if let Some(ref mut child) = *guard {
                        kill_process_tree(child);
                    }
                    *guard = None;
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
