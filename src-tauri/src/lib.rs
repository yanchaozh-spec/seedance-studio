use tauri::Manager;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn select_data_folder() -> Result<String, String> {
    use std::process::Command;
    
    // 使用系统对话框让用户选择文件夹
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
                
                // 初始化子文件夹
                let folders = ["projects", "assets", "database"];
                for folder in folders {
                    let sub_folder = data_folder.join(folder);
                    if !sub_folder.exists() {
                        let _ = fs::create_dir_all(&sub_folder);
                    }
                }
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
