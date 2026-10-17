//! SQLite 数据访问层（Rust 侧）
//!
//! 实现三个 Tauri 命令，供前端 `src/lib/bible-api.ts` 的 `isTauri()` 分支调用：
//!   - `bible_versions`  → 译本列表（对应前端 `VersionMeta[]`）
//!   - `bible_books`     → 66 卷书卷表（对应前端 `BookMeta[]`）
//!   - `bible_load_version` → 某译本全量经文（对应前端 `VersionData`：osis→chapter→verse→text）
//!
//! 使用 rusqlite（bundled 特性，自带 SQLite，无需系统 SQLite）。
//! 数据库路径解析见 `resolve_db_path`：兼容开发环境（项目根 resources/bible.db）
//! 与打包环境（随安装包打包到 $RESOURCE 目录，即 exe 同级或同级 resources/ 子目录）。

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

/// 解析 `bible.db` 的磁盘路径，兼容开发与打包两种环境：
///
/// - 开发环境：`tauri dev` 的可执行文件位于 `target/<profile>/`，向上回溯到项目根，
///   取 `<项目根>/resources/bible.db`；
/// - 打包环境：`bundle.resources` 以 `"bible.db"` 为 target 落到 `$RESOURCE` 目录下，
///   即 exe 同级目录或同级的 `resources/` 子目录，逐层向上查找两者；
/// - 兜底：当前工作目录下的 `resources/bible.db`。
fn resolve_db_path() -> Result<PathBuf, String> {
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent();
        while let Some(d) = dir {
            for candidate in [d.join("resources").join("bible.db"), d.join("bible.db")] {
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
            dir = d.parent();
        }
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let fallback = cwd.join("resources").join("bible.db");
    if fallback.exists() {
        return Ok(fallback);
    }
    Err(
        "找不到 bible.db：已在可执行文件目录及上级目录的 resources/ 与根目录、以及 CWD/resources/ 中查找。\
         开发环境需存在项目根 resources/bible.db；打包环境需通过 tauri.conf.json 的 bundle.resources 将其打包。"
            .to_string(),
    )
}

#[derive(Serialize)]
pub struct VersionMetaRow {
    code: String,
    name: String,
    #[serde(rename = "nameEn")]
    name_en: String,
    language: String,
    #[serde(rename = "godTerm")]
    god_term: String,
}

#[derive(Serialize)]
pub struct BookMetaRow {
    id: i64,
    osis: String,
    #[serde(rename = "nameCn")]
    name_cn: String,
    #[serde(rename = "nameCnTw")]
    name_cn_tw: String,
    #[serde(rename = "nameEn")]
    name_en: String,
    #[serde(rename = "abbr")]
    abbreviation: String,
    testament: String,
}

#[tauri::command]
pub fn bible_versions() -> Result<Vec<VersionMetaRow>, String> {
    let path = resolve_db_path()?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT code, name, name_en, language, god_term FROM versions ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params!(), |row| {
            Ok(VersionMetaRow {
                code: row.get(0)?,
                name: row.get(1)?,
                name_en: row.get(2)?,
                language: row.get(3)?,
                god_term: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn bible_books() -> Result<Vec<BookMetaRow>, String> {
    let path = resolve_db_path()?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, osis, name_cn, name_cn_tw, name_en, abbreviation, testament \
             FROM books ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params!(), |row| {
            Ok(BookMetaRow {
                id: row.get(0)?,
                osis: row.get(1)?,
                name_cn: row.get(2)?,
                name_cn_tw: row.get(3)?,
                name_en: row.get(4)?,
                abbreviation: row.get(5)?,
                testament: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 返回某译本全量经文：osis → chapter(字符串) → verse(字符串) → text。
/// 对应前端 `VersionData = Record<string, Record<string, Record<string, string>>>`。
#[tauri::command]
pub fn bible_load_version(
    code: String,
) -> Result<HashMap<String, HashMap<String, HashMap<String, String>>>, String> {
    let path = resolve_db_path()?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;

    let version_id: i64 = conn
        .query_row(
            "SELECT id FROM versions WHERE code = ?1",
            rusqlite::params![code],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format!("未找到译本 '{}'（bible.db 中无此 code）：{}", code, e))?;

    let mut stmt = conn
        .prepare(
            "SELECT b.osis, v.chapter, v.verse, v.text \
             FROM verses v JOIN books b ON b.id = v.book_id \
             WHERE v.version_id = ?1 \
             ORDER BY b.sort_order, v.chapter, v.verse",
        )
        .map_err(|e| e.to_string())?;

    let mut data: HashMap<String, HashMap<String, HashMap<String, String>>> = HashMap::new();
    let rows = stmt
        .query_map(rusqlite::params![version_id], |row| {
            Ok((
                row.get::<_, String>(0)?, // osis
                row.get::<_, i64>(1)?,    // chapter
                row.get::<_, i64>(2)?,    // verse
                row.get::<_, String>(3)?, // text
            ))
        })
        .map_err(|e| e.to_string())?;

    for r in rows {
        let (osis, chapter, verse, text) = r.map_err(|e| e.to_string())?;
        data.entry(osis)
            .or_default()
            .entry(chapter.to_string())
            .or_default()
            .insert(verse.to_string(), text);
    }

    if data.is_empty() {
        return Err(format!("译本 '{}' 在 bible.db 中没有任何经文记录", code));
    }
    Ok(data)
}
