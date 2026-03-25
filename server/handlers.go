package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ========================
//  ЧТЕНИЕ СЕРИЙ
// ========================

func handleSeries(w http.ResponseWriter, r *http.Request, webRoot string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := os.ReadFile(filepath.Join(webRoot, "locations_data.js"))
	if err != nil {
		http.Error(w, "Не удалось прочитать locations_data.js", http.StatusInternalServerError)
		return
	}

	// Извлекаем JSON из JS файла
	content := string(data)
	// Ищем начало объекта
	startIdx := strings.Index(content, "{")
	if startIdx == -1 {
		http.Error(w, "Неверный формат locations_data.js", http.StatusInternalServerError)
		return
	}
	// Убираем "const LOCATIONS_DATA = " и завершающий ";"
	jsonStr := content[startIdx:]
	jsonStr = strings.TrimRight(jsonStr, "; \n\r\t")

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(jsonStr))
}

// ========================
//  СОХРАНЕНИЕ СЕРИЙ
// ========================

func handleSaveSeries(w http.ResponseWriter, r *http.Request, webRoot string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Читаем тело запроса
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

	// Форматируем JSON красиво
	prettyJSON, err := json.MarshalIndent(checkData, "    ", "    ")
	if err != nil {
		http.Error(w, "Ошибка форматирования", http.StatusInternalServerError)
		return
	}

	// Формируем JS файл
	jsContent := fmt.Sprintf("const LOCATIONS_DATA = %s;\n", string(prettyJSON))

	// Создаём бэкап
	dataPath := filepath.Join(webRoot, "locations_data.js")
	backupPath := filepath.Join(webRoot, fmt.Sprintf("locations_data.backup_%s.js",
		time.Now().Format("20060102_150405")))

	if fileExists(dataPath) {
		copyFile(dataPath, backupPath)
	}

	// Записываем новый файл
	err = os.WriteFile(dataPath, []byte(jsContent), 0644)
	if err != nil {
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Данные сохранены",
		"backup":  filepath.Base(backupPath),
	})
}

// ========================
//  ЗАГРУЗКА ИЗОБРАЖЕНИЙ
// ========================

func handleUploadLocation(w http.ResponseWriter, r *http.Request, webRoot string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Максимум 20 МБ
	r.ParseMultipartForm(20 << 20)

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

	// Проверяем расширение
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		http.Error(w, "Допустимые форматы: PNG, JPG, WebP", http.StatusBadRequest)
		return
	}

	// Создаём папку locs если нет
	locsDir := filepath.Join(webRoot, "locs")
	os.MkdirAll(locsDir, 0755)

	// Сохраняем файл
	destPath := filepath.Join(locsDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		http.Error(w, "Ошибка создания файла", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
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
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Filename string `json:"filename"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Невалидный запрос", http.StatusBadRequest)
		return
	}

	// Защита от path traversal
	if strings.Contains(req.Filename, "..") || strings.Contains(req.Filename, "/") ||
		strings.Contains(req.Filename, "\\") {
		http.Error(w, "Недопустимое имя файла", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(webRoot, "locs", req.Filename)

	if !fileExists(filePath) {
		http.Error(w, "Файл не найден", http.StatusNotFound)
		return
	}

	err := os.Remove(filePath)
	if err != nil {
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
