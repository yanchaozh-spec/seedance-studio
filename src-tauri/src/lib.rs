use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};

// 全局保存子进程引用，退出时自动清理
static mut SERVER_PROCESS: Option<Child> = None;

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

/// 在生产模式下使用内嵌的 node.exe 启动 Next.js standalone server
fn start_nextjs_server(resource_dir: &std::path::Path) -> Result<Child, String> {
    // 使用内嵌的 node.exe（不需要用户安装 Node.js）
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

/// 等待服务器就绪（轮询 localhost:5000）
fn wait_for_server() -> bool {
    println!("[启动器] 等待服务器就绪...");
    
    for i in 0..60 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        if let Ok(resp) = reqwest::blocking::get("http://localhost:5000") {
            if resp.status().is_success() || resp.status().as_u16() == 307 {
                println!("[启动器] 服务器已就绪！耗时约 {}ms", (i + 1) * 500);
                return true;
            }
        }
    }
    
    println!("[启动器] 服务器启动超时（30秒）");
    false
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
                        unsafe { SERVER_PROCESS = Some(child); }
                        
                        // 等待服务器就绪
                        if wait_for_server() {
                            // 服务器就绪，导航到应用页面
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("window.location.href = 'http://localhost:5000';");
                            }
                        } else {
                            println!("[启动器] 警告：服务器启动超时，请手动刷新页面");
                        }
                    }
                    Err(e) => {
                        eprintln!("[启动器] 启动服务器失败: {}", e);
                    }
                }
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            // 窗口关闭时清理服务器进程
            if let tauri::WindowEvent::Destroyed = event {
                unsafe {
                    if let Some(ref mut child) = SERVER_PROCESS {
                        let _ = child.kill();
                        println!("[启动器] 窗口关闭，服务器进程已终止");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
