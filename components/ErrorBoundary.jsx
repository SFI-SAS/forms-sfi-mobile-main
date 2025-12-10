/**
 * Error Boundary Component
 * Captura errores de React y los registra
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { captureError } from "../utils/errorLogger";
import crashlyticsService from "../services/crashlytics";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    // Actualizar el estado para mostrar la UI de error
    return {
      hasError: true,
      error,
    };
  }

  async componentDidCatch(error, errorInfo) {
    // Registrar el error en el sistema de logs
    console.error("🔥 ErrorBoundary capturó un error:", error);
    console.error("📋 Información adicional:", errorInfo);

    // ✅ Enviar a Crashlytics PRIMERO
    try {
      crashlyticsService.setAttribute(
        "componentStack",
        errorInfo.componentStack?.substring(0, 100) || "N/A"
      );
      crashlyticsService.recordError(error, "React ErrorBoundary");
    } catch (e) {
      console.error("Error enviando a Crashlytics:", e);
    }

    // Guardar error en logs INMEDIATAMENTE sin await
    captureError(error, {
      errorType: "React Component Error",
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      timestamp: new Date().toISOString(),
    }).catch((logError) => {
      console.error("❌ Error al guardar en logs:", logError);
    });

    // También guardar en AsyncStorage como backup
    try {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const errorData = {
        timestamp: new Date().toISOString(),
        errorType: "React Component Error",
        message: error?.message || String(error),
        stack: error?.stack || "No stack",
        componentStack: errorInfo.componentStack,
      };
      AsyncStorage.setItem("LAST_REACT_ERROR", JSON.stringify(errorData)).catch(
        () => {}
      );
    } catch (e) {
      console.error("❌ Error guardando en AsyncStorage:", e);
    }

    // Actualizar estado con información del error
    this.setState({
      errorInfo,
      errorCount: this.state.errorCount + 1,
    });

    // Si hay un callback personalizado, llamarlo
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    // Reiniciar el error boundary
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Si hay un callback de reset, llamarlo
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Renderizar UI personalizada de error
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          resetError: this.handleReset,
        });
      }

      // UI de error por defecto
      return (
        <View style={styles.container}>
          <View style={styles.errorBox}>
            <Text style={styles.title}>⚠️ Algo salió mal</Text>
            <Text style={styles.message}>
              La aplicación encontró un error inesperado.
            </Text>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Detalles del error:</Text>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
                {this.state.error.stack && (
                  <Text style={styles.stackText}>{this.state.error.stack}</Text>
                )}
                {this.state.errorInfo?.componentStack && (
                  <>
                    <Text style={styles.detailsTitle}>Component Stack:</Text>
                    <Text style={styles.stackText}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Reintentar</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              El error ha sido registrado. Si el problema persiste, contacta
              soporte.
            </Text>
          </View>
        </View>
      );
    }

    // Si no hay error, renderizar children normalmente
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorBox: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 500,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ef4444",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: "#374151",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 24,
  },
  detailsContainer: {
    maxHeight: 300,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#dc2626",
    fontFamily: "monospace",
    marginBottom: 8,
  },
  stackText: {
    fontSize: 11,
    color: "#6b7280",
    fontFamily: "monospace",
    lineHeight: 16,
  },
  button: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 18,
  },
});

export default ErrorBoundary;
