/**
 * Log Viewer Component
 * Permite ver, exportar y limpiar los logs de errores
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import * as Sharing from "expo-sharing";
import {
  readLogs,
  clearLogs,
  getLogStats,
  exportLogs,
} from "../utils/errorLogger";

export default function LogViewer({ onClose }) {
  const [logs, setLogs] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const [logsContent, logsStats] = await Promise.all([
        readLogs(),
        getLogStats(),
      ]);
      setLogs(logsContent);
      setStats(logsStats);
    } catch (error) {
      console.error("Error cargando logs:", error);
      Alert.alert("Error", "No se pudieron cargar los logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
  };

  const handleClearLogs = () => {
    Alert.alert(
      "¿Limpiar logs?",
      "¿Estás seguro de que quieres eliminar todos los logs? Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpiar",
          style: "destructive",
          onPress: async () => {
            const success = await clearLogs();
            if (success) {
              Alert.alert("✅ Éxito", "Los logs han sido limpiados");
              await loadLogs();
            } else {
              Alert.alert("❌ Error", "No se pudieron limpiar los logs");
            }
          },
        },
      ]
    );
  };

  const handleExportLogs = async () => {
    try {
      const exportData = await exportLogs();
      if (!exportData) {
        Alert.alert("Error", "No se pudieron exportar los logs");
        return;
      }

      // Verificar si se puede compartir
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(exportData.uri, {
          dialogTitle: "Compartir logs de errores",
          mimeType: "text/plain",
        });
      } else {
        // Fallback a Share API nativa
        await Share.share({
          message: exportData.content,
          title: "Logs de errores",
        });
      }
    } catch (error) {
      console.error("Error exportando logs:", error);
      Alert.alert("Error", "No se pudieron exportar los logs");
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📋 Logs de Errores</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#12A0AF" />
          <Text style={styles.loadingText}>Cargando logs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 Logs de Errores</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total de logs:</Text>
            <Text style={styles.statValue}>{stats.count}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Tamaño:</Text>
            <Text style={styles.statValue}>{formatBytes(stats.size)}</Text>
          </View>
          {stats.sessionId && (
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Sesión:</Text>
              <Text style={styles.statValueSmall}>{stats.sessionId}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Text style={styles.buttonText}>
            {refreshing ? "⟳" : "🔄"} Actualizar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleExportLogs}
        >
          <Text style={styles.buttonText}>📤 Exportar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={handleClearLogs}
        >
          <Text style={styles.buttonText}>🗑️ Limpiar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logsContainer}>
        {logs ? (
          <Text style={styles.logsText}>{logs}</Text>
        ) : (
          <Text style={styles.emptyText}>No hay logs disponibles</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: "#6b7280",
    fontWeight: "bold",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  statsContainer: {
    backgroundColor: "white",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  statItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
  },
  statValueSmall: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1f2937",
    fontFamily: "monospace",
  },
  buttonRow: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#12A0AF",
  },
  buttonSecondary: {
    backgroundColor: "#6366f1",
  },
  buttonDanger: {
    backgroundColor: "#ef4444",
  },
  buttonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  logsContainer: {
    flex: 1,
    padding: 12,
  },
  logsText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#1f2937",
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
  },
});
