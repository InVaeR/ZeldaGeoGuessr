package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	maxUploadSize = 20 << 20 // 20 МБ
	maxJSONSize   = 5 << 20  // 5 МБ
	backupsDir    = "backups"
)

func main() {
	fmt.Println("╔══════════════════════════════════════╗")
	fmt.Println("║        Zelda GeoGuessr Server        ║")
	fmt.Println("╚══════════════════════════════════════╝")

	webRoot := findWebRoot()
	fmt.Printf("Корневая папка: %s\n", webRoot)

	// Создаём папку для бэкапов, чтобы не светить их через FileServer
	_ = os.MkdirAll(filepath.Join(webRoot, backupsDir), 0755)

	port := findFreePort(8080)

	mux := http.NewServeMux()

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

	// Статика — но прячем папку backups/
	fileServer := http.FileServer(http.Dir(webRoot))
	mux.Handle("/", noBackups(fileServer))

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	url := fmt.Sprintf("http://localhost:%d", port)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	fmt.Printf("Сервер запущен: %s\n", url)
	fmt.Println("Для остановки нажмите Ctrl+C или закройте это окно")

	go openBrowser(url)

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		fmt.Println("\nОстанавливаем сервер...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	err := server.ListenAndServe()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Printf("Ошибка запуска сервера: %v\n", err)
		fmt.Println("Нажмите Enter для выхода...")
		fmt.Scanln()
	}
}

// noBackups блокирует HTTP-доступ к папке backups/
func noBackups(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleaned := path.Clean(r.URL.Path)
		if cleaned == "/"+backupsDir || strings.HasPrefix(cleaned, "/"+backupsDir+"/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func findWebRoot() string {
	// Сначала проверяем папку где лежит .exe
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		if fileExists(filepath.Join(exeDir, "index.html")) {
			return exeDir
		}
		parentDir := filepath.Dir(exeDir)
		if fileExists(filepath.Join(parentDir, "index.html")) {
			return parentDir
		}
	}

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
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
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
