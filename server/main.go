package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
)

// Конфигурация сервера
type ServerConfig struct {
	Port    int    `json:"port"`
	WebRoot string `json:"webRoot"`
}

func main() {
	fmt.Println("╔══════════════════════════════════════╗")
	fmt.Println("║        Zelda GeoGuessr Server        ║")
	fmt.Println("╚══════════════════════════════════════╝")

	// Определяем корневую папку проекта
	webRoot := findWebRoot()
	fmt.Printf("Корневая папка: %s\n", webRoot)

	// Находим свободный порт
	port := findFreePort(8080)

	// Настраиваем маршруты
	mux := http.NewServeMux()

	// API endpoints
	mux.HandleFunc("/api/series", func(w http.ResponseWriter, r *http.Request) {
		handleSeries(w, r, webRoot)
	})
	mux.HandleFunc("/api/series/save", func(w http.ResponseWriter, r *http.Request) {
		handleSaveSeries(w, r, webRoot)
	})
	mux.HandleFunc("/api/upload-location", func(w http.ResponseWriter, r *http.Request) {
		handleUploadLocation(w, r, webRoot)
	})
	mux.HandleFunc("/api/delete-location-image", func(w http.ResponseWriter, r *http.Request) {
		handleDeleteLocationImage(w, r, webRoot)
	})
	mux.HandleFunc("/api/health", handleHealth)

	// Статические файлы (HTML, CSS, JS, карта, тайлы, изображения)
	fileServer := http.FileServer(http.Dir(webRoot))
	mux.Handle("/", fileServer)

	url := fmt.Sprintf("http://localhost:%d", port)
	fmt.Printf("Сервер запущен: %s\n", url)
	fmt.Println("Для остановки нажмите Ctrl+C или закройте это окно")

	// Открываем браузер
	go openBrowser(url)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		fmt.Println("\nСервер остановлен")
		os.Exit(0)
	}()

	// Запускаем сервер
	err := http.ListenAndServe(fmt.Sprintf(":%d", port), mux)
	if err != nil {
		fmt.Printf("Ошибка запуска сервера: %v\n", err)
		fmt.Println("Нажмите Enter для выхода...")
		fmt.Scanln()
	}
}

// findWebRoot ищет корневую папку проекта (где лежит index.html)
func findWebRoot() string {
	// Сначала проверяем папку где лежит .exe
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		if fileExists(filepath.Join(exeDir, "index.html")) {
			return exeDir
		}
		// Может быть exe лежит в server/
		parentDir := filepath.Dir(exeDir)
		if fileExists(filepath.Join(parentDir, "index.html")) {
			return parentDir
		}
	}

	// Проверяем текущую рабочую директорию
	cwd, err := os.Getwd()
	if err == nil {
		if fileExists(filepath.Join(cwd, "index.html")) {
			return cwd
		}
		parentDir := filepath.Dir(cwd)
		if fileExists(filepath.Join(parentDir, "index.html")) {
			return parentDir
		}
	}

	// Если ничего не нашли — используем текущую папку
	fmt.Println("⚠ Не удалось найти index.html, используется текущая папка")
	return "."
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// findFreePort находит свободный порт начиная с preferred
func findFreePort(preferred int) int {
	for port := preferred; port < preferred+100; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			ln.Close()
			return port
		}
	}
	return preferred
}

// openBrowser открывает URL в браузере по умолчанию
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = exec.Command("xdg-open", url).Start()
	}
	if err != nil {
		fmt.Printf("Откройте в браузере вручную: %s\n", url)
	}
}

// handleHealth — проверка что сервер жив
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}