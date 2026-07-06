package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var safeFilenameRe = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func isLocalHost(hostport string) bool {
	h, _, err := net.SplitHostPort(hostport)
	if err != nil {
		h = hostport
	}
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

func checkOrigin(r *http.Request) bool {
	if !isLocalHost(r.Host) {
		return false
	}
	raw := r.Header.Get("Origin")
	if raw == "" {
		raw = r.Header.Get("Referer")
	}
	if raw == "" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" {
		return false
	}
	if u.Scheme == "file" {
		return true
	}
	return isLocalHost(u.Host)
}

func setNoCache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
}

// ========================
//  ЧТЕНИЕ СЕРИЙ
// ========================

func handleSeries(w http.ResponseWriter, r *http.Request, webRoot string) {
	setNoCache(w)
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := os.ReadFile(filepath.Join(webRoot, "locations_data.js"))
	if err != nil {
		http.Error(w, "Не удалось прочитать locations_data.js", http.StatusInternalServerError)
		return
	}

	content := string(data)
	const marker = "const LOCATIONS_DATA = "
	markerIdx := strings.Index(content, marker)
	if markerIdx == -1 {
		http.Error(w, "Не найден маркер LOCATIONS_DATA", http.StatusInternalServerError)
		return
	}
	jsonStr := strings.TrimSpace(content[markerIdx+len(marker):])
	jsonStr = strings.TrimSuffix(jsonStr, ";")
	jsonStr = strings.TrimSpace(jsonStr)

	// Проверяем что это валидный JSON
	var check interface{}
	if err := json.Unmarshal([]byte(jsonStr), &check); err != nil {
		http.Error(w, "Не удалось распарсить данные", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(jsonStr))
}

// ========================
//  СОХРАНЕНИЕ СЕРИЙ
// ========================

func handleSaveSeries(w http.ResponseWriter, r *http.Request, webRoot string) {
	setNoCache(w)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkOrigin(r) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxJSONSize)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Ошибка чтения запроса", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Проверяем что это валидный JSON
	var checkData interface{}
	if err := json.Unmarshal(body, &checkData); err != nil {
		http.Error(w, "Невалидный JSON", http.StatusBadRequest)
		return
	}

	prettyJSON, err := json.MarshalIndent(checkData, "    ", "    ")
	if err != nil {
		http.Error(w, "Ошибка форматирования", http.StatusInternalServerError)
		return
	}

	jsContent := fmt.Sprintf("const LOCATIONS_DATA = %s;\n", string(prettyJSON))

	dataPath := filepath.Join(webRoot, "locations_data.js")
	backupName := fmt.Sprintf("locations_data.backup_%s.js", time.Now().Format("20060102_150405"))
	backupPath := filepath.Join(webRoot, backupsDir, backupName)

	if fileExists(dataPath) {
		if err := copyFile(dataPath, backupPath); err != nil {
			fmt.Printf("⚠ Не удалось создать бэкап: %v\n", err)
		}
	}

	cleanOldBackups(webRoot, 20)

	tmpPath := dataPath + ".tmp"
	if err := os.WriteFile(tmpPath, []byte(jsContent), 0644); err != nil {
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
		return
	}
	if err := os.Rename(tmpPath, dataPath); err != nil {
		os.Remove(tmpPath)
		http.Error(w, "Ошибка сохранения файла", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Данные сохранены",
		"backup":  backupName,
	})
}

// ========================
//  ЗАГРУЗКА ИЗОБРАЖЕНИЙ
// ========================

func handleUploadLocation(w http.ResponseWriter, r *http.Request, webRoot string) {
	setNoCache(w)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkOrigin(r) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1<<20)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		http.Error(w, "Файл слишком большой или повреждён", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Ошибка получения файла", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Имя файла из формы или оригинальное
	filename := r.FormValue("filename")
	if filename == "" {
		filename = header.Filename
	}
	// Берём только базовое имя — на всякий случай
	filename = filepath.Base(filename)

	if !safeFilenameRe.MatchString(filename) {
		http.Error(w, "Недопустимое имя файла (разрешены A-Z, 0-9, '.', '_', '-')", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		http.Error(w, "Допустимые форматы: PNG, JPG, WebP", http.StatusBadRequest)
		return
	}

	// Проверка содержимого: первые 512 байт
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "Файл не является изображением", http.StatusBadRequest)
		return
	}
	src := io.MultiReader(bytes.NewReader(buf[:n]), file)

	// Создаём папку locs если нет
	locsDir := filepath.Join(webRoot, "locs")
	if err := os.MkdirAll(locsDir, 0755); err != nil {
		http.Error(w, "Ошибка создания папки locs", http.StatusInternalServerError)
		return
	}

	destPath := filepath.Join(locsDir, filename)
	// Проверка: путь должен оставаться внутри locsDir
	absLocs, _ := filepath.Abs(locsDir)
	absDest, _ := filepath.Abs(destPath)
	rel, err := filepath.Rel(absLocs, absDest)
	if err != nil || strings.HasPrefix(rel, "..") {
		http.Error(w, "Недопустимый путь", http.StatusBadRequest)
		return
	}

	tmpPath := destPath + ".tmp"
	dst, err := os.Create(tmpPath)
	if err != nil {
		http.Error(w, "Ошибка создания файла", http.StatusInternalServerError)
		return
	}

	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(tmpPath)
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
		return
	}
	dst.Close()

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		http.Error(w, "Ошибка сохранения файла", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":   "ok",
		"filename": filename,
	})
}

// ========================
//  УДАЛЕНИЕ ИЗОБРАЖЕНИЙ
// ========================

func handleDeleteLocationImage(w http.ResponseWriter, r *http.Request, webRoot string) {
	setNoCache(w)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkOrigin(r) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		Filename string `json:"filename"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Невалидный запрос", http.StatusBadRequest)
		return
	}

	req.Filename = filepath.Base(req.Filename)
	if !safeFilenameRe.MatchString(req.Filename) {
		http.Error(w, "Недопустимое имя файла", http.StatusBadRequest)
		return
	}

	locsDir := filepath.Join(webRoot, "locs")
	filePath := filepath.Join(locsDir, req.Filename)

	absLocs, _ := filepath.Abs(locsDir)
	absFile, _ := filepath.Abs(filePath)
	rel, err := filepath.Rel(absLocs, absFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		http.Error(w, "Недопустимый путь", http.StatusBadRequest)
		return
	}

	if !fileExists(filePath) {
		http.Error(w, "Файл не найден", http.StatusNotFound)
		return
	}

	if err := os.Remove(filePath); err != nil {
		http.Error(w, "Ошибка удаления файла", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Файл удалён",
	})
}

// ========================
//  УТИЛИТЫ
// ========================

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

func cleanOldBackups(webRoot string, keep int) {
	backupsPath := filepath.Join(webRoot, backupsDir)
	entries, err := os.ReadDir(backupsPath)
	if err != nil {
		return
	}

	var backupFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "locations_data.backup_") {
			backupFiles = append(backupFiles, filepath.Join(backupsPath, e.Name()))
		}
	}

	sort.Strings(backupFiles)
	if len(backupFiles) > keep {
		for _, f := range backupFiles[:len(backupFiles)-keep] {
			os.Remove(f)
		}
	}
}
